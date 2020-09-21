const { gql } = require("apollo-server");
const { getRestrictedZoneIds } = require("../util");

const typeDefs = gql`
  type Item {
    id: ID!
    name: String!
    description: String!
    thumbnailUrl: String!
    rarityIndex: Int!
    isNc: Boolean!

    # When this item was first added to DTI. ISO 8601 string, or null if the
    # item was added so long ago that we don't have this field!
    createdAt: String

    currentUserOwnsThis: Boolean!
    currentUserWantsThis: Boolean!

    # How this item appears on the given species/color combo. If it does not
    # fit the pet, we'll return an empty ItemAppearance with no layers.
    appearanceOn(speciesId: ID!, colorId: ID!): ItemAppearance!

    # This is set manually by Support users, when the pet is only for e.g.
    # Maraquan pets, and our usual auto-detection isn't working. We provide
    # this for the Support UI; it's not very helpful for most users, because it
    # can be empty even if the item _has_ an auto-detected special color.
    manualSpecialColor: Color

    # This is set manually by Support users, when the item _seems_ to fit all
    # pets the same because of its zones, but it actually doesn't - e.g.,
    # the Dug Up Dirt Foreground actually looks different for each body. We
    # provide this for the Support UI; it's not very helpful for most users,
    # because it's only used at modeling time. This value does not change how
    # layer data from this API should be interpreted!
    explicitlyBodySpecific: Boolean!

    # Get the species that we need modeled for this item for the given color.
    #
    # NOTE: Most color IDs won't be accepted here. Either pass the ID of a
    #       major special color like Baby (#6), or leave it blank for standard
    #       bodies like Blue, Green, Red, etc.
    speciesThatNeedModels(colorId: ID): [Species!]!

    # Species that we know how they look wearing this item. Used to initialize
    # the preview on the item page with a compatible species.
    # TODO: This would probably make more sense as like, compatible bodies, so
    #       we could also encode special-color stuff in here too.
    speciesWithAppearanceDataForThisItem: [Species!]!
  }

  type ItemAppearance {
    id: ID!
    item: Item!
    bodyId: ID!
    layers: [AppearanceLayer!]
    restrictedZones: [Zone!]!
  }

  type ItemSearchResult {
    query: String!
    zones: [Zone!]!
    items: [Item!]!
  }

  extend type Query {
    item(id: ID!): Item
    items(ids: [ID!]!): [Item!]!
    itemSearch(query: String!): ItemSearchResult!
    itemSearchToFit(
      query: String!
      speciesId: ID!
      colorId: ID!
      zoneIds: [ID!]
      offset: Int
      limit: Int
    ): ItemSearchResult!

    # Get items that need models for the given color.
    #
    # NOTE: Most color IDs won't be accepted here. Either pass the ID of a
    #       major special color like Baby (#6), or leave it blank for standard
    #       bodies like Blue, Green, Red, etc.
    itemsThatNeedModels(colorId: ID): [Item!]!
  }
`;

const resolvers = {
  Item: {
    name: async ({ id, name }, _, { itemTranslationLoader }) => {
      if (name) return name;
      const translation = await itemTranslationLoader.load(id);
      return translation.name;
    },
    description: async ({ id, description }, _, { itemTranslationLoader }) => {
      if (description) return description;
      const translation = await itemTranslationLoader.load(id);
      return translation.description;
    },
    thumbnailUrl: async ({ id, thumbnailUrl }, _, { itemLoader }) => {
      if (thumbnailUrl) return thumbnailUrl;
      const item = await itemLoader.load(id);
      return item.thumbnailUrl;
    },
    rarityIndex: async ({ id, rarityIndex }, _, { itemLoader }) => {
      if (rarityIndex) return rarityIndex;
      const item = await itemLoader.load(id);
      return item.rarityIndex;
    },
    isNc: async ({ id, rarityIndex }, _, { itemLoader }) => {
      if (rarityIndex != null) return rarityIndex === 500 || rarityIndex === 0;
      const item = await itemLoader.load(id);
      return item.rarityIndex === 500 || item.rarityIndex === 0;
    },
    createdAt: async ({ id }, _, { itemLoader }) => {
      const item = await itemLoader.load(id);
      return item.createdAt && item.createdAt.toISOString();
    },

    currentUserOwnsThis: async (
      { id },
      _,
      { currentUserId, userClosetHangersLoader }
    ) => {
      if (currentUserId == null) return false;
      const closetHangers = await userClosetHangersLoader.load(currentUserId);
      return closetHangers.some((h) => h.itemId === id && h.owned);
    },
    currentUserWantsThis: async (
      { id },
      _,
      { currentUserId, userClosetHangersLoader }
    ) => {
      if (currentUserId == null) return false;
      const closetHangers = await userClosetHangersLoader.load(currentUserId);
      return closetHangers.some((h) => h.itemId === id && !h.owned);
    },

    appearanceOn: async (
      { id },
      { speciesId, colorId },
      { petTypeBySpeciesAndColorLoader }
    ) => {
      const petType = await petTypeBySpeciesAndColorLoader.load({
        speciesId,
        colorId,
      });
      return { item: { id }, bodyId: petType.bodyId };
    },
    manualSpecialColor: async ({ id }, _, { itemLoader }) => {
      const item = await itemLoader.load(id);
      return item.manualSpecialColorId != null
        ? { id: item.manualSpecialColorId }
        : null;
    },
    explicitlyBodySpecific: async ({ id }, _, { itemLoader }) => {
      const item = await itemLoader.load(id);
      return item.explicitlyBodySpecific;
    },
    speciesThatNeedModels: async (
      { id },
      { colorId = "8" }, // Blue
      { itemsThatNeedModelsLoader }
    ) => {
      const speciesIdsByColorIdAndItemId = await itemsThatNeedModelsLoader.load(
        "all"
      );
      const speciesIdsByItemId = speciesIdsByColorIdAndItemId.get(colorId);
      const row = speciesIdsByItemId && speciesIdsByItemId.get(id);
      if (!row) {
        return [];
      }

      const modeledSpeciesIds = row.modeledSpeciesIds.split(",");
      // HACK: Needs to be updated if more species are added!
      const allSpeciesIds = Array.from(
        { length: row.supportsVandagyre ? 55 : 54 },
        (_, i) => String(i + 1)
      );
      const unmodeledSpeciesIds = allSpeciesIds.filter(
        (id) => !modeledSpeciesIds.includes(id)
      );
      return unmodeledSpeciesIds.map((id) => ({ id }));
    },
    speciesWithAppearanceDataForThisItem: async (
      { id },
      _,
      { itemSpeciesWithAppearanceDataLoader }
    ) => {
      const rows = await itemSpeciesWithAppearanceDataLoader.load(id);
      return rows.map((row) => ({ id: row.id }));
    },
  },

  ItemAppearance: {
    id: ({ item, bodyId }) => `item-${item.id}-body-${bodyId}`,
    layers: async ({ item, bodyId }, _, { itemSwfAssetLoader }) => {
      const allSwfAssets = await itemSwfAssetLoader.load({
        itemId: item.id,
        bodyId,
      });

      return allSwfAssets.filter((sa) => sa.url.endsWith(".swf"));
    },
    restrictedZones: async (
      { item: { id: itemId }, bodyId },
      _,
      { itemSwfAssetLoader, itemLoader }
    ) => {
      // Check whether this appearance is empty. If so, restrict no zones.
      const allSwfAssets = await itemSwfAssetLoader.load({ itemId, bodyId });
      if (allSwfAssets.length === 0) {
        return [];
      }

      const item = await itemLoader.load(itemId);
      return getRestrictedZoneIds(item.zonesRestrict).map((id) => ({ id }));
    },
  },

  Query: {
    item: (_, { id }) => ({ id }),
    items: (_, { ids }) => {
      return ids.map((id) => ({ id }));
    },
    itemSearch: async (_, { query }, { itemSearchLoader }) => {
      const items = await itemSearchLoader.load(query.trim());
      return { query, items };
    },
    itemSearchToFit: async (
      _,
      { query, speciesId, colorId, zoneIds = [], offset, limit },
      { petTypeBySpeciesAndColorLoader, itemSearchToFitLoader }
    ) => {
      const petType = await petTypeBySpeciesAndColorLoader.load({
        speciesId,
        colorId,
      });
      const { bodyId } = petType;
      const items = await itemSearchToFitLoader.load({
        query: query.trim(),
        bodyId,
        zoneIds,
        offset,
        limit,
      });
      const zones = zoneIds.map((id) => ({ id }));
      return { query, zones, items };
    },
    itemsThatNeedModels: async (
      _,
      { colorId = "8" }, // Defaults to Blue
      { itemsThatNeedModelsLoader }
    ) => {
      const speciesIdsByColorIdAndItemId = await itemsThatNeedModelsLoader.load(
        "all"
      );
      const speciesIdsByItemIds = speciesIdsByColorIdAndItemId.get(colorId);
      const itemIds = (speciesIdsByItemIds && speciesIdsByItemIds.keys()) || [];
      return Array.from(itemIds, (id) => ({ id }));
    },
  },
};

module.exports = { typeDefs, resolvers };
