const { gql } = require("apollo-server");
const { getRestrictedZoneIds, oneWeek, oneHour } = require("../util");

const typeDefs = gql`
  type Item @cacheControl(maxAge: ${oneWeek}) {
    id: ID!
    name: String!
    description: String!
    thumbnailUrl: String!
    rarityIndex: Int!

    # Whether this item comes from the NC Mall.
    isNc: Boolean!

    # Whether this item comes from a paintbrush.
    isPb: Boolean!

    # When this item was first added to DTI. ISO 8601 string, or null if the
    # item was added so long ago that we don't have this field!
    createdAt: String

    currentUserOwnsThis: Boolean! @cacheControl(scope: PRIVATE)
    currentUserWantsThis: Boolean! @cacheControl(scope: PRIVATE)

    # How many users are offering/seeking this in their public trade lists.
    numUsersOfferingThis: Int! @cacheControl(maxAge: ${oneHour})
    numUsersSeekingThis: Int! @cacheControl(maxAge: ${oneHour})

    # The trades available for this item, grouped by offering vs seeking.
    tradesOffering: [ItemTrade!]! @cacheControl(maxAge: 0)
    tradesSeeking: [ItemTrade!]! @cacheControl(maxAge: 0)

    # How this item appears on the given species/color combo. If it does not
    # fit the pet, we'll return an empty ItemAppearance with no layers.
    appearanceOn(speciesId: ID!, colorId: ID!): ItemAppearance! @cacheControl(maxAge: ${oneHour})

    # This is set manually by Support users, when the pet is only for e.g.
    # Maraquan pets, and our usual auto-detection isn't working. We provide
    # this for the Support UI; it's not very helpful for most users, because it
    # can be empty even if the item _has_ an auto-detected special color.
    manualSpecialColor: Color @cacheControl(maxAge: 0)

    # This is set manually by Support users, when the item _seems_ to fit all
    # pets the same because of its zones, but it actually doesn't - e.g.,
    # the Dug Up Dirt Foreground actually looks different for each body. We
    # provide this for the Support UI; it's not very helpful for most users,
    # because it's only used at modeling time. This value does not change how
    # layer data from this API should be interpreted!
    explicitlyBodySpecific: Boolean! @cacheControl(maxAge: 0)

    # Get the species that we need modeled for this item for the given color.
    #
    # NOTE: Most color IDs won't be accepted here. Either pass the ID of a
    #       major special color like Baby (#6), or leave it blank for standard
    #       bodies like Blue, Green, Red, etc.
    speciesThatNeedModels(colorId: ID): [Species!]! @cacheControl(maxAge: ${oneHour})

    # Return a single ItemAppearance for this item. It'll be for the species
    # with the smallest ID for which we have item appearance data. We use this
    # on the item page, to initialize the preview section. (You can find out
    # which species this is for by going through the body field on
    # ItemAppearance!)
    canonicalAppearance: ItemAppearance @cacheControl(maxAge: ${oneHour})

    # All zones that this item occupies, for at least one body. That is, it's
    # a union of zones for all of its appearances! We use this for overview
    # info about the item.
    allOccupiedZones: [Zone!]! @cacheControl(maxAge: ${oneHour})

    # All bodies that this item is compatible with. Note that this might return
    # the special representsAllPets body, e.g. if this is just a Background!
    compatibleBodies: [Body!]! @cacheControl(maxAge: ${oneHour})
  }

  type ItemAppearance {
    id: ID!
    item: Item!
    bodyId: ID! # Deprecated, use body->id.
    body: Body!
    layers: [AppearanceLayer!]
    restrictedZones: [Zone!]!
  }

  enum ItemKindSearchFilter {
    NC
    NP
    PB
  }

  # TODO: I guess I didn't add the NC/NP/PB filter to this. Does that cause
  #       bugs in comparing results on the client? (Also, should we just throw
  #       this out for a better merge function?)
  type ItemSearchResult {
    query: String!
    zones: [Zone!]!
    items: [Item!]!
  }

  type ItemTrade {
    id: ID!
    user: User!
    closetList: ClosetList!
  }

  extend type Query {
    item(id: ID!): Item
    items(ids: [ID!]!): [Item!]!

    # Find items by name. Exact match, except for some tweaks, like
    # case-insensitivity and trimming extra whitespace. Null if not found.
    #
    # NOTE: These aren't used in DTI at time of writing; they're a courtesy API
    #       for the /r/Neopets Discord bot's outfit preview command!
    itemByName(name: String!): Item
    itemsByName(names: [String!]!): [Item]!

    # Search for items with fuzzy matching.
    itemSearch(
      query: String!
      itemKind: ItemKindSearchFilter
      currentUserOwnsOrWants: OwnsOrWants
      zoneIds: [ID!]
      offset: Int
      limit: Int
    ): ItemSearchResult!
    itemSearchToFit(
      query: String!
      itemKind: ItemKindSearchFilter
      currentUserOwnsOrWants: OwnsOrWants
      zoneIds: [ID!]
      speciesId: ID!
      colorId: ID!
      offset: Int
      limit: Int
    ): ItemSearchResult!

    # Get the 20 items most recently added to our database. Cache for 1 hour.
    newestItems: [Item!]! @cacheControl(maxAge: 3600)

    # Get items that need models for the given color.
    #
    # NOTE: Most color IDs won't be accepted here. Either pass the ID of a
    #       major special color like Baby (#6), or leave it blank for standard
    #       bodies like Blue, Green, Red, etc.
    itemsThatNeedModels(colorId: ID): [Item!]!
  }

  extend type Mutation {
    addToItemsCurrentUserOwns(itemId: ID!): Item
    removeFromItemsCurrentUserOwns(itemId: ID!): Item

    addToItemsCurrentUserWants(itemId: ID!): Item
    removeFromItemsCurrentUserWants(itemId: ID!): Item
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
    isPb: async ({ id }, _, { itemTranslationLoader }) => {
      const translation = await itemTranslationLoader.load(id);
      if (!translation) {
        console.warn(
          `Item.isPb: Translation not found for item ${id}. Returning false.`
        );
        return false;
      }
      return translation.description.includes(
        "This item is part of a deluxe paint brush set!"
      );
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

    numUsersOfferingThis: async ({ id }, _, { itemTradeCountsLoader }) => {
      const count = await itemTradeCountsLoader.load({
        itemId: id,
        isOwned: true,
      });
      return count;
    },
    numUsersSeekingThis: async ({ id }, _, { itemTradeCountsLoader }) => {
      const count = await itemTradeCountsLoader.load({
        itemId: id,
        isOwned: false,
      });
      return count;
    },

    tradesOffering: async ({ id }, _, { itemTradesLoader }) => {
      const trades = await itemTradesLoader.load({ itemId: id, isOwned: true });
      return trades.map((trade) => ({
        id: trade.id,
        closetList: trade.closetList
          ? { id: trade.closetList.id }
          : {
              isDefaultList: true,
              userId: trade.user.id,
              ownsOrWantsItems: "OWNS",
            },
        user: { id: trade.user.id },
      }));
    },

    tradesSeeking: async ({ id }, _, { itemTradesLoader }) => {
      const trades = await itemTradesLoader.load({
        itemId: id,
        isOwned: false,
      });
      return trades.map((trade) => ({
        id: trade.id,
        closetList: trade.closetList
          ? { id: trade.closetList.id }
          : {
              isDefaultList: true,
              userId: trade.user.id,
              ownsOrWantsItems: "WANTS",
            },
        user: { id: trade.user.id },
      }));
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
    canonicalAppearance: async (
      { id },
      _,
      { itemBodiesWithAppearanceDataLoader }
    ) => {
      const rows = await itemBodiesWithAppearanceDataLoader.load(id);
      const canonicalBodyId = rows[0].bodyId;
      return {
        item: { id },
        bodyId: canonicalBodyId,
        // An optimization: we know the species already, so fill it in here
        // without requiring an extra query if we want it.
        // TODO: Maybe this would be cleaner if we make the body -> species
        //       loader, and prime it in the item bodies loader, rather than
        //       setting it here?
        body: { id: canonicalBodyId, species: { id: rows[0].speciesId } },
      };
    },
    allOccupiedZones: async ({ id }, _, { itemAllOccupiedZonesLoader }) => {
      const zoneIds = await itemAllOccupiedZonesLoader.load(id);
      const zones = zoneIds.map((id) => ({ id }));
      return zones;
    },
    compatibleBodies: async ({ id }, _, { db }) => {
      const [rows, __] = await db.query(
        `
        SELECT DISTINCT swf_assets.body_id
          FROM items
          INNER JOIN parents_swf_assets ON
            items.id = parents_swf_assets.parent_id AND
              parents_swf_assets.parent_type = "Item"
          INNER JOIN swf_assets ON
            parents_swf_assets.swf_asset_id = swf_assets.id
          WHERE items.id = ?
        `,
        [id]
      );
      const bodyIds = rows.map((row) => row.body_id);
      const bodies = bodyIds.map((id) => ({ id }));
      return bodies;
    },
  },

  ItemAppearance: {
    id: ({ item, bodyId }) => `item-${item.id}-body-${bodyId}`,
    body: ({ body, bodyId }) => body || { id: bodyId },
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
    itemByName: async (_, { name }, { itemByNameLoader }) => {
      const { item } = await itemByNameLoader.load(name);
      return item ? { id: item.id } : null;
    },
    itemsByName: async (_, { names }, { itemByNameLoader }) => {
      const items = await itemByNameLoader.loadMany(names);
      return items.map(({ item }) => (item ? { id: item.id } : null));
    },
    itemSearch: async (
      _,
      { query, itemKind, currentUserOwnsOrWants, zoneIds = [], offset, limit },
      { itemSearchLoader, currentUserId }
    ) => {
      const items = await itemSearchLoader.load({
        query: query.trim(),
        itemKind,
        currentUserOwnsOrWants,
        currentUserId,
        zoneIds,
        offset,
        limit,
      });
      const zones = zoneIds.map((id) => ({ id }));
      return { query, zones, items };
    },
    itemSearchToFit: async (
      _,
      {
        query,
        speciesId,
        colorId,
        itemKind,
        currentUserOwnsOrWants,
        zoneIds = [],
        offset,
        limit,
      },
      { petTypeBySpeciesAndColorLoader, itemSearchToFitLoader, currentUserId }
    ) => {
      const petType = await petTypeBySpeciesAndColorLoader.load({
        speciesId,
        colorId,
      });
      const { bodyId } = petType;
      const items = await itemSearchToFitLoader.load({
        query: query.trim(),
        itemKind,
        currentUserOwnsOrWants,
        currentUserId,
        zoneIds,
        bodyId,
        offset,
        limit,
      });
      const zones = zoneIds.map((id) => ({ id }));
      return { query, zones, items };
    },
    newestItems: async (_, __, { newestItemsLoader }) => {
      const items = await newestItemsLoader.load("all-newest");
      return items.map((item) => ({ id: item.id }));
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

  Mutation: {
    addToItemsCurrentUserOwns: async (
      _,
      { itemId },
      { currentUserId, db, itemLoader }
    ) => {
      if (currentUserId == null) {
        throw new Error(`must be logged in`);
      }

      const item = await itemLoader.load(itemId);
      if (item == null) {
        return null;
      }

      // Send an INSERT query that will add a hanger, if the user doesn't
      // already have one for this item.
      // Adapted from https://stackoverflow.com/a/3025332/107415
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.query(
        `
          INSERT INTO closet_hangers
            (item_id, user_id, quantity, created_at, updated_at, owned)
            SELECT ?, ?, ?, ?, ?, ? FROM DUAL
              WHERE NOT EXISTS (
                SELECT 1 FROM closet_hangers
                  WHERE item_id = ? AND user_id = ? AND owned = ?
              )
        `,
        [itemId, currentUserId, 1, now, now, true, itemId, currentUserId, true]
      );

      return { id: itemId };
    },
    removeFromItemsCurrentUserOwns: async (
      _,
      { itemId },
      { currentUserId, db, itemLoader }
    ) => {
      if (currentUserId == null) {
        throw new Error(`must be logged in`);
      }

      const item = await itemLoader.load(itemId);
      if (item == null) {
        return null;
      }

      await db.query(
        `DELETE FROM closet_hangers
         WHERE item_id = ? AND user_id = ? AND owned = ?;`,
        [itemId, currentUserId, true]
      );

      return { id: itemId };
    },
    addToItemsCurrentUserWants: async (
      _,
      { itemId },
      { currentUserId, db, itemLoader }
    ) => {
      if (currentUserId == null) {
        throw new Error(`must be logged in`);
      }

      const item = await itemLoader.load(itemId);
      if (item == null) {
        return null;
      }

      // Send an INSERT query that will add a hanger, if the user doesn't
      // already have one for this item.
      // Adapted from https://stackoverflow.com/a/3025332/107415
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.query(
        `
          INSERT INTO closet_hangers
            (item_id, user_id, quantity, created_at, updated_at, owned)
            SELECT ?, ?, ?, ?, ?, ? FROM DUAL
              WHERE NOT EXISTS (
                SELECT 1 FROM closet_hangers
                  WHERE item_id = ? AND user_id = ? AND owned = ?
              )
        `,
        [
          itemId,
          currentUserId,
          1,
          now,
          now,
          false,
          itemId,
          currentUserId,
          false,
        ]
      );

      return { id: itemId };
    },
    removeFromItemsCurrentUserWants: async (
      _,
      { itemId },
      { currentUserId, db, itemLoader }
    ) => {
      if (currentUserId == null) {
        throw new Error(`must be logged in`);
      }

      const item = await itemLoader.load(itemId);
      if (item == null) {
        return null;
      }

      await db.query(
        `DELETE FROM closet_hangers
         WHERE item_id = ? AND user_id = ? AND owned = ?;`,
        [itemId, currentUserId, false]
      );

      return { id: itemId };
    },
  },
};

module.exports = { typeDefs, resolvers };
