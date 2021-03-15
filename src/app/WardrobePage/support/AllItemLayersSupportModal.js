import React from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Select,
  Tooltip,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { gql, useQuery } from "@apollo/client";
import {
  appearanceLayerFragment,
  itemAppearanceFragment,
  petAppearanceFragment,
} from "../../components/useOutfitAppearance";
import HangerSpinner from "../../components/HangerSpinner";
import { ErrorMessage, useCommonStyles } from "../../util";
import ItemSupportAppearanceLayer from "./ItemSupportAppearanceLayer";
import { EditIcon } from "@chakra-ui/icons";

function AllItemLayersSupportModal({ item, isOpen, onClose }) {
  const [bulkAddProposal, setBulkAddProposal] = React.useState(null);

  const { bodyBackground } = useCommonStyles();

  return (
    <Modal size="4xl" isOpen={isOpen} onClose={onClose}>
      <ModalOverlay>
        <ModalContent background={bodyBackground}>
          <ModalHeader as="h1" paddingBottom="2">
            <Box as="span" fontWeight="700">
              Layers on all pets:
            </Box>{" "}
            <Box as="span" fontWeight="normal">
              {item.name}
            </Box>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody paddingBottom="12">
            <BulkAddBodySpecificAssetsForm
              bulkAddProposal={bulkAddProposal}
              onSubmit={setBulkAddProposal}
            />
            <Box height="8" />
            <AllItemLayersSupportModalContent
              item={item}
              bulkAddProposal={bulkAddProposal}
            />
          </ModalBody>
        </ModalContent>
      </ModalOverlay>
    </Modal>
  );
}

function BulkAddBodySpecificAssetsForm({ bulkAddProposal, onSubmit }) {
  const [minAssetId, setMinAssetId] = React.useState(
    bulkAddProposal?.minAssetId
  );
  const [numSpecies, setNumSpecies] = React.useState(55);

  return (
    <Flex
      align="center"
      as="form"
      fontSize="sm"
      opacity="0.9"
      transition="0.2s all"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ minAssetId, numSpecies });
      }}
    >
      <Tooltip
        label={
          <Box textAlign="center" fontSize="xs">
            <Box as="p" marginBottom="1em">
              When an item accidentally gets assigned to fit all bodies, this
              tool can help you recover the original appearances, by assuming
              the layer IDs are assigned to each species in alphabetical order.
            </Box>
            <Box as="p">
              This will only find layers that have already been modeled!
            </Box>
          </Box>
        }
      >
        <Flex align="center" tabIndex="0">
          <EditIcon marginRight="1" />
          <Box>Bulk-add body-specific assets:</Box>
        </Flex>
      </Tooltip>
      <Box width="2" />
      <Input
        type="number"
        min="1"
        step="1"
        size="xs"
        width="9ch"
        placeholder="Min ID"
        value={minAssetId || ""}
        onChange={(e) => setMinAssetId(e.target.value || null)}
      />
      <Box width="1" />
      <Box>–</Box>
      <Box width="1" />
      <Input
        type="number"
        min="55"
        step="1"
        size="xs"
        width="9ch"
        placeholder="Max ID"
        // Because this is an inclusive range, the offset between the numbers
        // is one less than the number of entries in the range.
        value={minAssetId != null ? Number(minAssetId) + (numSpecies - 1) : ""}
        onChange={(e) =>
          setMinAssetId(
            e.target.value ? Number(e.target.value) - (numSpecies - 1) : null
          )
        }
      />
      <Box width="1" />
      for
      <Box width="1" />
      <Select
        size="xs"
        width="20ch"
        value={String(numSpecies)}
        onChange={(e) => setNumSpecies(Number(e.target.value))}
      >
        <option value="55">All 55 species</option>
        <option value="54">54 species, no Vandagyre</option>
      </Select>
      <Box width="2" />
      <Button type="submit" size="xs" isDisabled={minAssetId == null}>
        Preview
      </Button>
    </Flex>
  );
}

function AllItemLayersSupportModalContent({ item, bulkAddProposal }) {
  const { loading, error, data } = useQuery(
    gql`
      query AllItemLayersSupportModal($itemId: ID!) {
        item(id: $itemId) {
          id
          allAppearances {
            id
            body {
              id
              representsAllBodies
              canonicalAppearance {
                id
                species {
                  id
                  name
                }
                color {
                  id
                  name
                  isStandard
                }
                pose
                ...PetAppearanceForOutfitPreview
              }
            }
            ...ItemAppearanceForOutfitPreview
          }
        }
      }

      ${itemAppearanceFragment}
      ${petAppearanceFragment}
    `,
    { variables: { itemId: item.id } }
  );

  const {
    loading: loading2,
    error: error2,
    data: bulkAddProposalData,
  } = useQuery(
    gql`
      query AllItemLayersSupportModal_BulkAddProposal($layerRemoteIds: [ID!]!) {
        layersToAdd: itemAppearanceLayersByRemoteId(
          remoteIds: $layerRemoteIds
        ) {
          id
          ...AppearanceLayerForOutfitPreview
        }

        allSpecies {
          id
          name
          standardBodyId
          canonicalAppearance {
            id
            species {
              id
              name
            }
            color {
              id
              name
              isStandard
            }
            pose
            ...PetAppearanceForOutfitPreview
          }
        }
      }

      ${appearanceLayerFragment}
      ${petAppearanceFragment}
    `,
    {
      variables: {
        layerRemoteIds: bulkAddProposal
          ? Array.from({ length: 54 }, (_, i) =>
              String(Number(bulkAddProposal.minAssetId) + i)
            )
          : [],
      },
      skip: bulkAddProposal == null,
    }
  );

  if (loading || loading2) {
    return (
      <Flex align="center" justify="center" minHeight="64">
        <HangerSpinner />
      </Flex>
    );
  }

  if (error || error2) {
    return <ErrorMessage>{(error || error2).message}</ErrorMessage>;
  }

  let itemAppearances = data.item?.allAppearances || [];
  itemAppearances = mergeBulkAddProposalIntoItemAppearances(
    itemAppearances,
    bulkAddProposal,
    bulkAddProposalData
  );
  itemAppearances = [...itemAppearances].sort((a, b) => {
    const aKey = getSortKeyForBody(a.body);
    const bKey = getSortKeyForBody(b.body);
    return aKey.localeCompare(bKey);
  });

  return (
    <Wrap justify="center" spacing="4">
      {itemAppearances.map((itemAppearance) => (
        <WrapItem key={itemAppearance.id}>
          <ItemAppearanceCard item={item} itemAppearance={itemAppearance} />
        </WrapItem>
      ))}
    </Wrap>
  );
}

function ItemAppearanceCard({ item, itemAppearance }) {
  const petAppearance = itemAppearance.body.canonicalAppearance;
  const biologyLayers = petAppearance.layers;
  const itemLayers = [...itemAppearance.layers].sort(
    (a, b) => a.zone.depth - b.zone.depth
  );

  const { brightBackground } = useCommonStyles();

  return (
    <Box
      background={brightBackground}
      paddingX="4"
      paddingY="3"
      boxShadow="lg"
      borderRadius="lg"
    >
      <Heading as="h2" size="sm" fontWeight="600">
        {getBodyName(itemAppearance.body)}
      </Heading>
      <Box height="3" />
      <Wrap paddingX="3" spacing="5">
        {itemLayers.length === 0 && (
          <Flex
            minWidth="150px"
            minHeight="150px"
            align="center"
            justify="center"
          >
            <Box fontSize="sm" fontStyle="italic">
              (No data)
            </Box>
          </Flex>
        )}
        {itemLayers.map((itemLayer) => (
          <WrapItem key={itemLayer.id}>
            <ItemSupportAppearanceLayer
              item={item}
              itemLayer={itemLayer}
              biologyLayers={biologyLayers}
              outfitState={{
                speciesId: petAppearance.species.id,
                colorId: petAppearance.color.id,
                pose: petAppearance.pose,
              }}
            />
          </WrapItem>
        ))}
      </Wrap>
    </Box>
  );
}

function getSortKeyForBody(body) {
  // "All bodies" sorts first!
  if (body.representsAllBodies) {
    return "";
  }

  const { color, species } = body.canonicalAppearance;
  // Sort standard colors first, then special colors by name, then by species
  // within each color.
  return `${color.isStandard ? "A" : "Z"}-${color.name}-${species.name}`;
}

function getBodyName(body) {
  if (body.representsAllBodies) {
    return "All bodies";
  }

  const { species, color } = body.canonicalAppearance;
  const speciesName = capitalize(species.name);
  const colorName = color.isStandard ? "Standard" : capitalize(color.name);
  return `${colorName} ${speciesName}`;
}

function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1);
}

function mergeBulkAddProposalIntoItemAppearances(
  itemAppearances,
  bulkAddProposal,
  bulkAddProposalData
) {
  if (!bulkAddProposalData) {
    return itemAppearances;
  }

  const { allSpecies, layersToAdd } = bulkAddProposalData;

  // Do a deep copy of the existing item appearances, so we can mutate them as
  // we loop through them in this function!
  const mergedItemAppearances = JSON.parse(JSON.stringify(itemAppearances));

  // To exclude Vandagyre, we take the first N species by ID - which is
  // different than the alphabetical sort order we use for assigning layers!
  const speciesToInclude = [...allSpecies]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, bulkAddProposal.numSpecies);

  // Set up the incoming data in convenient formats.
  const sortedSpecies = [...speciesToInclude].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const layersToAddByRemoteId = {};
  for (const layer of layersToAdd) {
    layersToAddByRemoteId[layer.remoteId] = layer;
  }

  for (const [index, species] of sortedSpecies.entries()) {
    // Find the existing item appearance to add to, or create a new one if it
    // doesn't exist yet.
    let itemAppearance = mergedItemAppearances.find(
      (a) =>
        a.body.canonicalAppearance.species.id === species.id &&
        !a.body.representsAllBodies
    );
    if (!itemAppearance) {
      itemAppearance = {
        id: `bulk-add-proposal-new-item-appearance-for-body-${species.standardBodyId}`,
        layers: [],
        body: {
          id: species.standardBodyId,
          canonicalAppearance: species.canonicalAppearance,
        },
      };
      mergedItemAppearances.push(itemAppearance);
    }

    const layerToAddRemoteId = String(
      Number(bulkAddProposal.minAssetId) + index
    );
    const layerToAdd = layersToAddByRemoteId[layerToAddRemoteId];
    if (!layerToAdd) {
      continue;
    }

    // Delete this layer from other appearances (because we're going to
    // override its body ID), then add it to this new one.
    for (const otherItemAppearance of mergedItemAppearances) {
      const indexToDelete = otherItemAppearance.layers.findIndex(
        (l) => l.remoteId === layerToAddRemoteId
      );
      if (indexToDelete >= 0) {
        otherItemAppearance.layers.splice(indexToDelete, 1);
      }
    }
    itemAppearance.layers.push(layerToAdd);
  }

  return mergedItemAppearances;
}

export default AllItemLayersSupportModal;
