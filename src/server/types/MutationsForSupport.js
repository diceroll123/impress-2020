import { gql } from "apollo-server";
import { ManagementClient } from "auth0";

const auth0 = new ManagementClient({
  domain: "openneo.us.auth0.com",
  clientId: process.env.AUTH0_SUPPORT_CLIENT_ID,
  clientSecret: process.env.AUTH0_SUPPORT_CLIENT_SECRET,
  scope: "read:users update:users",
});

import {
  capitalize,
  getPoseFromPetState,
  getPetStateFieldsFromPose,
  getPoseName,
  loadBodyName,
  logToDiscord,
  normalizeRow,
} from "../util";

const typeDefs = gql`
  type RemoveLayerFromItemMutationResult {
    layer: AppearanceLayer!
    item: Item!
  }

  extend type Mutation {
    setManualSpecialColor(
      itemId: ID!
      colorId: ID
      supportSecret: String!
    ): Item!

    setItemExplicitlyBodySpecific(
      itemId: ID!
      explicitlyBodySpecific: Boolean!
      supportSecret: String!
    ): Item!

    setLayerBodyId(
      layerId: ID!
      bodyId: ID!
      supportSecret: String!
    ): AppearanceLayer!

    removeLayerFromItem(
      layerId: ID!
      itemId: ID!
      supportSecret: String!
    ): RemoveLayerFromItemMutationResult!

    setPetAppearancePose(
      appearanceId: ID!
      pose: Pose!
      supportSecret: String!
    ): PetAppearance!

    setPetAppearanceIsGlitched(
      appearanceId: ID!
      isGlitched: Boolean!
      supportSecret: String!
    ): PetAppearance!

    setUsername(userId: ID!, newUsername: String!, supportSecret: String!): User
  }
`;

const resolvers = {
  Mutation: {
    setManualSpecialColor: async (
      _,
      { itemId, colorId, supportSecret },
      { itemLoader, itemTranslationLoader, colorTranslationLoader, db }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldItem = await itemLoader.load(itemId);

      const [
        result,
      ] = await db.execute(
        `UPDATE items SET manual_special_color_id = ? WHERE id = ? LIMIT 1`,
        [colorId, itemId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Expected to affect 1 item, but affected ${result.affectedRows}`
        );
      }

      itemLoader.clear(itemId); // we changed the item, so clear it from cache

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          const [
            itemTranslation,
            oldColorTranslation,
            newColorTranslation,
          ] = await Promise.all([
            itemTranslationLoader.load(itemId),
            oldItem.manualSpecialColorId
              ? colorTranslationLoader.load(oldItem.manualSpecialColorId)
              : Promise.resolve(null),
            colorId
              ? colorTranslationLoader.load(colorId)
              : Promise.resolve(null),
          ]);

          const oldColorName = oldColorTranslation
            ? capitalize(oldColorTranslation.name)
            : "Auto-detect";
          const newColorName = newColorTranslation
            ? capitalize(newColorTranslation.name)
            : "Auto-detect";
          await logToDiscord({
            embeds: [
              {
                title: `🛠 ${itemTranslation.name}`,
                thumbnail: {
                  url: oldItem.thumbnailUrl,
                  height: 80,
                  width: 80,
                },
                fields: [
                  {
                    name: "Special color",
                    value: `${oldColorName} → **${newColorName}**`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress.openneo.net/items/${oldItem.id}`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { id: itemId };
    },

    setItemExplicitlyBodySpecific: async (
      _,
      { itemId, explicitlyBodySpecific, supportSecret },
      { itemLoader, itemTranslationLoader, db }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldItem = await itemLoader.load(itemId);

      const [
        result,
      ] = await db.execute(
        `UPDATE items SET explicitly_body_specific = ? WHERE id = ? LIMIT 1`,
        [explicitlyBodySpecific ? 1 : 0, itemId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Expected to affect 1 item, but affected ${result.affectedRows}`
        );
      }

      itemLoader.clear(itemId); // we changed the item, so clear it from cache

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          const itemTranslation = await itemTranslationLoader.load(itemId);
          const oldRuleName = oldItem.explicitlyBodySpecific
            ? "Body specific"
            : "Auto-detect";
          const newRuleName = explicitlyBodySpecific
            ? "Body specific"
            : "Auto-detect";
          await logToDiscord({
            embeds: [
              {
                title: `🛠 ${itemTranslation.name}`,
                thumbnail: {
                  url: oldItem.thumbnailUrl,
                  height: 80,
                  width: 80,
                },
                fields: [
                  {
                    name: "Pet compatibility rule",
                    value: `${oldRuleName} → **${newRuleName}**`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress.openneo.net/items/${oldItem.id}`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { id: itemId };
    },

    setLayerBodyId: async (
      _,
      { layerId, bodyId, supportSecret },
      {
        itemLoader,
        itemTranslationLoader,
        swfAssetLoader,
        zoneTranslationLoader,
        db,
      }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldSwfAsset = await swfAssetLoader.load(layerId);

      const [
        result,
      ] = await db.execute(
        `UPDATE swf_assets SET body_id = ? WHERE id = ? LIMIT 1`,
        [bodyId, layerId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Expected to affect 1 layer, but affected ${result.affectedRows}`
        );
      }

      swfAssetLoader.clear(layerId); // we changed it, so clear it from cache

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          const itemId = await db
            .execute(
              `SELECT parent_id FROM parents_swf_assets
             WHERE swf_asset_id = ? AND parent_type = "Item" LIMIT 1;`,
              [layerId]
            )
            .then(([rows]) => normalizeRow(rows[0]).parentId);

          const [
            item,
            itemTranslation,
            zoneTranslation,
            oldBodyName,
            newBodyName,
          ] = await Promise.all([
            itemLoader.load(itemId),
            itemTranslationLoader.load(itemId),
            zoneTranslationLoader.load(oldSwfAsset.zoneId),
            loadBodyName(oldSwfAsset.bodyId, db),
            loadBodyName(bodyId, db),
          ]);

          await logToDiscord({
            embeds: [
              {
                title: `🛠 ${itemTranslation.name}`,
                thumbnail: {
                  url: item.thumbnailUrl,
                  height: 80,
                  width: 80,
                },
                fields: [
                  {
                    name:
                      `Layer ${layerId} (${zoneTranslation.label}): ` +
                      `Pet compatibility`,
                    value: `${oldBodyName} → **${newBodyName}**`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress.openneo.net/items/${itemId}`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { id: layerId };
    },

    removeLayerFromItem: async (
      _,
      { layerId, itemId, supportSecret },
      {
        itemLoader,
        itemTranslationLoader,
        swfAssetLoader,
        zoneTranslationLoader,
        db,
      }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldSwfAsset = await swfAssetLoader.load(layerId);

      const [result] = await db.execute(
        `DELETE FROM parents_swf_assets ` +
          `WHERE swf_asset_id = ? AND parent_type = "Item" AND parent_id = ? ` +
          `LIMIT 1`,
        [layerId, itemId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Expected to affect 1 layer, but affected ${result.affectedRows}`
        );
      }

      swfAssetLoader.clear(layerId); // we changed it, so clear it from cache

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          const [
            item,
            itemTranslation,
            zoneTranslation,
            bodyName,
          ] = await Promise.all([
            itemLoader.load(itemId),
            itemTranslationLoader.load(itemId),
            zoneTranslationLoader.load(oldSwfAsset.zoneId),
            loadBodyName(oldSwfAsset.bodyId, db),
          ]);

          await logToDiscord({
            embeds: [
              {
                title: `🛠 ${itemTranslation.name}`,
                thumbnail: {
                  url: item.thumbnailUrl,
                  height: 80,
                  width: 80,
                },
                fields: [
                  {
                    name: `Layer ${layerId} (${zoneTranslation.label})`,
                    value: `❌ Removed from ${bodyName}`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress.openneo.net/items/${itemId}`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { layer: { id: layerId }, item: { id: itemId } };
    },

    setPetAppearancePose: async (
      _,
      { appearanceId, pose, supportSecret },
      {
        colorTranslationLoader,
        speciesTranslationLoader,
        petStateLoader,
        petTypeLoader,
        db,
      }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldPetState = await petStateLoader.load(appearanceId);

      const {
        moodId,
        female,
        unconverted,
        labeled,
      } = getPetStateFieldsFromPose(pose);

      const [result] = await db.execute(
        `UPDATE pet_states SET mood_id = ?, female = ?, unconverted = ?,
         labeled = ? WHERE id = ? LIMIT 1`,
        [moodId, female, unconverted, labeled, appearanceId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Expected to affect 1 layer, but affected ${result.affectedRows}`
        );
      }

      // we changed it, so clear it from cache
      petStateLoader.clear(appearanceId);

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          const petType = await petTypeLoader.load(oldPetState.petTypeId);
          const [colorTranslation, speciesTranslation] = await Promise.all([
            colorTranslationLoader.load(petType.colorId),
            speciesTranslationLoader.load(petType.speciesId),
          ]);

          const oldPose = getPoseFromPetState(oldPetState);
          const colorName = capitalize(colorTranslation.name);
          const speciesName = capitalize(speciesTranslation.name);

          await logToDiscord({
            embeds: [
              {
                title: `🛠 ${colorName} ${speciesName}`,
                thumbnail: {
                  url: `http://pets.neopets.com/cp/${
                    petType.basicImageHash || petType.imageHash
                  }/1/6.png`,
                  height: 150,
                  width: 150,
                },
                fields: [
                  {
                    name: `Appearance ${appearanceId}: Pose`,
                    value: `${getPoseName(oldPose)} → **${getPoseName(pose)}**`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress-2020.openneo.net/outfits/new?species=${petType.speciesId}&color=${petType.colorId}&pose=${pose}&state=${appearanceId}`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { id: appearanceId };
    },

    setPetAppearanceIsGlitched: async (
      _,
      { appearanceId, isGlitched, supportSecret },
      {
        colorTranslationLoader,
        speciesTranslationLoader,
        petStateLoader,
        petTypeLoader,
        db,
      }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldPetState = await petStateLoader.load(appearanceId);

      const [
        result,
      ] = await db.execute(
        `UPDATE pet_states SET glitched = ? WHERE id = ? LIMIT 1`,
        [isGlitched, appearanceId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Expected to affect 1 layer, but affected ${result.affectedRows}`
        );
      }

      // we changed it, so clear it from cache
      petStateLoader.clear(appearanceId);

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          const petType = await petTypeLoader.load(oldPetState.petTypeId);
          const [colorTranslation, speciesTranslation] = await Promise.all([
            colorTranslationLoader.load(petType.colorId),
            speciesTranslationLoader.load(petType.speciesId),
          ]);

          const colorName = capitalize(colorTranslation.name);
          const speciesName = capitalize(speciesTranslation.name);

          const pose = getPoseFromPetState(oldPetState);
          const oldGlitchinessState =
            String(oldPetState.glitched) === "1" ? "Glitched" : "Valid";
          const newGlitchinessState = isGlitched ? "Glitched" : "Valid";

          await logToDiscord({
            embeds: [
              {
                title: `🛠 ${colorName} ${speciesName}`,
                thumbnail: {
                  url: `http://pets.neopets.com/cp/${
                    petType.basicImageHash || petType.imageHash
                  }/1/6.png`,
                  height: 150,
                  width: 150,
                },
                fields: [
                  {
                    name: `Appearance ${appearanceId}`,
                    value: `${oldGlitchinessState} → **${newGlitchinessState}**`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress-2020.openneo.net/outfits/new?species=${petType.speciesId}&color=${petType.colorId}&pose=${pose}&state=${appearanceId}`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { id: appearanceId };
    },

    setUsername: async (
      _,
      { userId, newUsername, supportSecret },
      { userLoader, db }
    ) => {
      assertSupportSecretOrThrow(supportSecret);

      const oldUser = await userLoader.load(userId);
      if (!oldUser) {
        return null;
      }

      const [[result1, result2]] = await db.query(
        `
          UPDATE users SET name = ? WHERE id = ? LIMIT 1;
          UPDATE openneo_id.users SET name = ? WHERE id = ? LIMIT 1;
        `,
        [newUsername, userId, newUsername, oldUser.remoteId]
      );

      if (result1.affectedRows !== 1) {
        throw new Error(
          `[UPDATE 1] Expected to affect 1 user, but affected ${result1.affectedRows}`
        );
      }

      if (result2.affectedRows !== 1) {
        throw new Error(
          `[UPDATE 2] Expected to affect 1 user, but affected ${result2.affectedRows}`
        );
      }

      // we changed it, so clear it from cache
      userLoader.clear(userId);

      // We also want to update the username in Auth0, which is separate! It's
      // possible that this will fail even though the db update succeeded, but
      // I'm not going to bother to write recovery code; in that case, the
      // error will reach the support user console, and we can work to manually
      // fix it.
      await auth0.users.update(
        { id: `auth0|impress-${userId}` },
        { username: newUsername }
      );

      if (process.env["SUPPORT_TOOLS_DISCORD_WEBHOOK_URL"]) {
        try {
          await logToDiscord({
            embeds: [
              {
                title: `🛠 User ${oldUser.id}: ${newUsername}`,
                fields: [
                  {
                    name: `Username`,
                    value: `${oldUser.name} → **${newUsername}**`,
                  },
                ],
                timestamp: new Date().toISOString(),
                url: `https://impress-2020.openneo.net/user/${oldUser.id}/items`,
              },
            ],
          });
        } catch (e) {
          console.error("Error sending Discord support log", e);
        }
      } else {
        console.warn("No Discord support webhook provided, skipping");
      }

      return { id: userId };
    },
  },
};

function assertSupportSecretOrThrow(supportSecret) {
  if (supportSecret !== process.env["SUPPORT_SECRET"]) {
    throw new Error(`Support secret is incorrect. Try setting up again?`);
  }
}

module.exports = { typeDefs, resolvers };
