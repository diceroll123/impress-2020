import { createHmac } from "crypto";
import { normalizeRow } from "./util";

// https://stackoverflow.com/a/201378/107415
const EMAIL_PATTERN = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

export async function getAuthToken({ username, password, ipAddress }, db) {
  // For legacy reasons (and I guess decent security reasons too!), auth info
  // is stored in a users table in a separate database. First, look up the user
  // in that database, and get their encrypted auth info.
  const [rowsFromOpenneoId] = await db.query(
    `
      SELECT id, encrypted_password, password_salt FROM openneo_id.users
      WHERE name = ?;
    `,
    [username]
  );
  if (rowsFromOpenneoId.length === 0) {
    console.debug(
      `[getAuthToken] Failed: No user named ${JSON.stringify(username)}.`
    );
    return null;
  }

  // Then, use the password encrpytion function to validate the password the
  // user is trying to log in with.
  const { id, encryptedPassword, passwordSalt } = normalizeRow(
    rowsFromOpenneoId[0]
  );
  const encryptedProvidedPassword = encryptPassword(password, passwordSalt);

  if (encryptedProvidedPassword !== encryptedPassword) {
    console.debug(
      `[getAuthToken] Failed: Encrypted input password ` +
        `${JSON.stringify(encryptedProvidedPassword)} ` +
        `did not match for user ${JSON.stringify(username)}.`
    );
    return null;
  }

  // Then, look up this user's ID in the main Dress to Impress database.
  // (For silly legacy reasons, it can be - and in our current database is
  // always! - different than the ID in the Openneo ID database.)
  const [rowsFromOpenneoImpress] = await db.query(
    `
      SELECT id FROM openneo_impress.users WHERE remote_id = ?;
    `,
    [id]
  );
  if (rowsFromOpenneoImpress.length === 0) {
    // TODO: Auto-create the impress row in this case? will it ever happen tho?
    throw new Error(
      `Syncing error: user exists in openneo_id, but not openneo_impress.`
    );
  }
  const { id: impressId } = normalizeRow(rowsFromOpenneoImpress[0]);

  // One more thing: Update the user record to keep track of this login.
  await db.query(
    `
    UPDATE openneo_id.users
      SET last_sign_in_at = current_sign_in_at,
        current_sign_in_at = CURRENT_TIMESTAMP(),
        last_sign_in_ip = current_sign_in_ip,
        current_sign_in_ip = ?,
        sign_in_count = sign_in_count + 1,
        updated_at = CURRENT_TIMESTAMP()
      WHERE id = ? LIMIT 1;
  `,
    [ipAddress, id]
  );

  // Finally, create and return the auth token itself. The caller will handle
  // setting it to a cookie etc.
  const authToken = createAuthToken(impressId);
  console.debug(`[getAuthToken] Succeeded: ${JSON.stringify(authToken)}`);
  return authToken;
}

function createAuthToken(impressId) {
  // This contains a `userId` field, a `createdAt` field, and a signature of
  // the object with every field but the `signature` field. The signature also
  // uses HMAC-SHA256 (which doesn't at all need to be in sync with the
  // password hashing, but it's a good algorithm so we chose it again), and the
  // key this time is a secret global value called `DTI_AUTH_TOKEN_SECRET`.
  // This proves that the auth token was generated by the app, because only the
  // app knows the secret.
  const unsignedAuthToken = {
    userId: impressId,
    createdAt: new Date().toISOString(),
  };
  const signature = computeSignatureForAuthToken(unsignedAuthToken);
  return { ...unsignedAuthToken, signature };
}

function encryptPassword(password, passwordSalt) {
  // Use HMAC-SHA256 to encrypt the password. The random salt for this user,
  // saved in the database, is the HMAC "key". (That way, if our database
  // leaks, each user's password would need to be cracked individually, instead
  // of being susceptible to attacks where you match our database against a
  // database of SHA256 hashes for common passwords.)
  const passwordHmac = createHmac("sha256", passwordSalt);
  passwordHmac.update(password);
  return passwordHmac.digest("hex");
}

export async function getUserIdFromToken(authToken) {
  // Check the auth token's signature, to make sure we're the ones who created
  // it. (The signature depends on the DTI_AUTH_TOKEN_SECRET, so we should be
  // the only ones who can generate accurate signatures.)
  const { signature, ...unsignedAuthToken } = authToken;
  const actualSignature = computeSignatureForAuthToken(unsignedAuthToken);
  if (signature !== actualSignature) {
    console.warn(
      `[getUserIdFromToken] Signature ${signature} did not match auth ` +
        `token. Rejecting.`
    );
    return null;
  }

  // Then, check that the cookie was created within the past week. If not,
  // treat it as expired; we'll have the user log in again, as a general
  // security practice.
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  if (authToken.createdAt < oneWeekAgo) {
    console.warn(
      `[getUserIdFromToken] Auth token expired, was created at ` +
        `${authToken.createdAt}. Rejecting.`
    );
    return null;
  }

  // Okay, it passed validation: this is a real auth token generated by us, and
  // it hasn't expired. Now we can safely trust it: return its own userId!
  return authToken.userId;
}

function computeSignatureForAuthToken(unsignedAuthToken) {
  if (process.env["DTI_AUTH_TOKEN_SECRET"] == null) {
    throw new Error(
      `The DTI_AUTH_TOKEN_SECRET environment variable is missing. ` +
        `The server admin should create a random secret, and save it in the ` +
        `.env file.`
    );
  }
  const authTokenHmac = createHmac(
    "sha256",
    process.env["DTI_AUTH_TOKEN_SECRET"]
  );
  authTokenHmac.update(JSON.stringify(unsignedAuthToken));
  return authTokenHmac.digest("hex");
}

export async function createAccount(
  { username, password, email, _ /* ipAddress */ },
  __ /* db */
) {
  const errors = [];
  if (!username) {
    errors.push({ type: "USERNAME_IS_REQUIRED" });
  }
  if (!password) {
    errors.push({ type: "PASSWORD_IS_REQUIRED" });
  }
  if (!email) {
    errors.push({ type: "EMAIL_IS_REQUIRED" });
  }
  if (email && !email?.match(EMAIL_PATTERN)) {
    errors.push({ type: "EMAIL_MUST_BE_VALID" });
  }

  // TODO: Add an error for non-unique username.

  if (errors.length > 0) {
    return { errors, authToken: null };
  }

  throw new Error(`TODO: Actually create the account!`);

  // await db.query(`
  //   INSERT INTO openneo_id.users
  //     (name, encrypted_password, email, password_salt, sign_in_count,
  //       current_sign_in_at, current_sign_in_ip, created_at, updated_at)
  //     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP(), ?,
  //       CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());
  // `, [username, encryptedPassword, email, passwordSalt, ipAddress]);

  // return { errors: [], authToken: createAuthToken(6) };
}