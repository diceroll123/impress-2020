const fetch = require("node-fetch");
const { gql } = require("apollo-server");

const typeDefs = gql`
  type Outfit {
    id: ID!
    name: String!
    petAppearance: PetAppearance!
    wornItems: [Item!]!
    closetedItems: [Item!]!

    species: Species! # to be deprecated? can use petAppearance? 🤔
    color: Color! # to be deprecated? can use petAppearance? 🤔
    pose: Pose! # to be deprecated? can use petAppearance? 🤔
    items: [Item!]! # deprecated alias for wornItems
  }

  extend type Query {
    outfit(id: ID!): Outfit
    petOnNeopetsDotCom(petName: String!): Outfit
  }
`;

const resolvers = {
  Outfit: {
    name: async ({ id }, _, { outfitLoader }) => {
      const outfit = await outfitLoader.load(id);
      return outfit.name;
    },
    petAppearance: async ({ id }, _, { outfitLoader }) => {
      const outfit = await outfitLoader.load(id);
      return { id: outfit.petStateId };
    },
    wornItems: async ({ id }, _, { itemOutfitRelationshipsLoader }) => {
      const relationships = await itemOutfitRelationshipsLoader.load(id);
      return relationships
        .filter((oir) => oir.isWorn)
        .map((oir) => ({ id: oir.itemId }));
    },
    closetedItems: async ({ id }, _, { itemOutfitRelationshipsLoader }) => {
      const relationships = await itemOutfitRelationshipsLoader.load(id);
      return relationships
        .filter((oir) => !oir.isWorn)
        .map((oir) => ({ id: oir.itemId }));
    },
  },
  Query: {
    outfit: (_, { id }) => ({ id }),
    petOnNeopetsDotCom: async (
      _,
      { petName },
      { db, itemLoader, itemTranslationLoader }
    ) => {
      // Start all these requests as soon as possible...
      const petMetaDataPromise = loadPetMetaData(petName);
      const customPetDataPromise = loadCustomPetData(petName);
      const modelingPromise = customPetDataPromise.then((customPetData) =>
        saveModelingData(customPetData, {
          db,
          itemLoader,
          itemTranslationLoader,
        })
      );

      // ...then wait on all of them before finishing. It's important to wait
      // on modeling, so that it doesn't get cut off when the request ends!
      const [petMetaData, customPetData, __] = await Promise.all([
        petMetaDataPromise,
        customPetDataPromise,
        modelingPromise,
      ]);

      const outfit = {
        // TODO: This isn't a fully-working Outfit object. It works for the
        //       client as currently implemented, but we'll probably want to
        //       move the client and this onto our more generic fields!
        species: { id: customPetData.custom_pet.species_id },
        color: { id: customPetData.custom_pet.color_id },
        pose: getPoseFromPetData(petMetaData, customPetData),
        items: Object.values(customPetData.object_info_registry).map((o) => ({
          id: o.obj_info_id,
          name: o.name,
          description: o.description,
          thumbnailUrl: o.thumbnail_url,
          rarityIndex: o.rarity_index,
        })),
      };

      return outfit;
    },
  },
};

async function loadPetMetaData(petName) {
  const url =
    `http://www.neopets.com/amfphp/json.php/PetService.getPet` + `/${petName}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `for pet meta data, neopets.com returned: ` +
        `${res.status} ${res.statusText}. (${url})`
    );
  }

  const json = await res.json();
  return json;
}

async function loadCustomPetData(petName) {
  const url =
    `http://www.neopets.com/amfphp/json.php/CustomPetService.getViewerData` +
    `/${petName}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `for custom pet data, neopets.com returned: ` +
        `${res.status} ${res.statusText}. (${url})`
    );
  }

  const json = await res.json();
  if (!json.custom_pet) {
    throw new Error(`missing custom_pet data`);
  }

  return json;
}

function getPoseFromPetData(petMetaData, petCustomData) {
  // TODO: Use custom data to decide if Unconverted.
  const moodId = petMetaData.mood;
  const genderId = petMetaData.gender;
  if (String(moodId) === "1" && String(genderId) === "1") {
    return "HAPPY_MASC";
  } else if (String(moodId) === "1" && String(genderId) === "2") {
    return "HAPPY_FEM";
  } else if (String(moodId) === "2" && String(genderId) === "1") {
    return "SAD_MASC";
  } else if (String(moodId) === "2" && String(genderId) === "2") {
    return "SAD_FEM";
  } else if (String(moodId) === "4" && String(genderId) === "1") {
    return "SICK_MASC";
  } else if (String(moodId) === "4" && String(genderId) === "2") {
    return "SICK_FEM";
  } else {
    throw new Error(
      `could not identify pose: ` +
        `moodId=${moodId}, ` +
        `genderId=${genderId}`
    );
  }
}

async function saveModelingData(
  customPetData,
  { db, itemLoader, itemTranslationLoader }
) {
  const objectInfos = Object.values(customPetData.object_info_registry);

  const incomingItems = objectInfos.map((objectInfo) => [
    String(objectInfo.obj_info_id),
    {
      id: String(objectInfo.obj_info_id),
      zonesRestrict: objectInfo.zones_restrict,
      thumbnailUrl: objectInfo.thumbnail_url,
      category: objectInfo.category,
      type: objectInfo.type,
      rarityIndex: objectInfo.rarity_index,
      price: objectInfo.price,
      weightLbs: objectInfo.weight_lbs,
    },
  ]);

  const incomingItemTranslations = objectInfos.map((objectInfo) => [
    String(objectInfo.obj_info_id),
    {
      itemId: String(objectInfo.obj_info_id),
      locale: "en",
      name: objectInfo.name,
      description: objectInfo.description,
      rarity: objectInfo.rarity,
    },
  ]);

  await Promise.all([
    syncToDb("items", itemLoader, db, incomingItems),
    syncToDb(
      "item_translations",
      itemTranslationLoader,
      db,
      incomingItemTranslations
    ),
  ]);
}

/**
 * Syncs the given data to the database: for each incoming row, if there's no
 * matching row in the loader, we insert a new row; or, if there's a matching
 * row in the loader but its data is different, we update it; or, if there's
 * no change, we do nothing.
 *
 * Automatically sets the `createdAt` and `updatedAt` timestamps for inserted
 * or updated rows.
 *
 * Will perform one call to the loader, and at most one INSERT, and at most one
 * UPDATE, regardless of how many rows we're syncing.
 */
async function syncToDb(tableName, loader, db, incomingRows) {
  const loaderKeys = incomingRows.map(([key, _]) => key);
  const currentRows = await loader.loadMany(loaderKeys);

  const rowsToInsert = [];
  for (const index in incomingRows) {
    const [_, incomingRow] = incomingRows[index];
    const currentRow = currentRows[index];

    if (currentRow instanceof Error) {
      rowsToInsert.push({
        ...incomingRow,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  if (rowsToInsert.length > 0) {
    // Get the column names from the first row, and convert them to
    // underscore-case instead of camel-case.
    const rowKeys = Object.keys(rowsToInsert[0]).sort();
    const columnNames = rowKeys.map((key) =>
      key.replace(/[A-Z]/g, (m) => "_" + m[0].toLowerCase())
    );
    const columnsStr = columnNames.join(", ");
    const qs = columnNames.map((_) => "?").join(", ");
    const rowQs = rowsToInsert.map((_) => "(" + qs + ")").join(", ");
    const rowFields = rowsToInsert.map((row) => rowKeys.map((key) => row[key]));
    await db.execute(
      `INSERT INTO ${tableName} (${columnsStr}) VALUES ${rowQs};`,
      rowFields.flat()
    );
  }

  // TODO: Update rows that need updating
}

module.exports = { typeDefs, resolvers };
