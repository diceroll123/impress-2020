import React from "react";
import {
  Box,
  Editable,
  EditablePreview,
  EditableInput,
  Flex,
  Grid,
  Heading,
  Icon,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  PseudoBox,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/core";

import ItemList from "./ItemList";
import useOutfitState from "./useOutfitState.js";
import { ITEMS } from "./data";

function WardrobePage() {
  const [data, wearItemRaw] = useOutfitState();
  const [searchQuery, setSearchQuery] = React.useState("");

  const toast = useToast();
  const [hasSentToast, setHasSentToast] = React.useState(false);
  const wearItem = React.useCallback(
    (itemIdToAdd) => {
      wearItemRaw(itemIdToAdd);

      if (!hasSentToast) {
        setTimeout(() => {
          toast({
            title: "So, the outfit didn't change 😅",
            description:
              "This is a prototype, and the outfit preview is static right " +
              "now! But the list animation is good, yeah? Nice and smooth 😊",
            status: "warning",
            isClosable: true,
            duration: 10000,
            position: window.innerWidth < 992 ? "top" : "bottom-left",
          });
        }, 3000);
        setHasSentToast(true);
      }
    },
    [toast, wearItemRaw, hasSentToast, setHasSentToast]
  );

  return (
    <Grid
      // Fullscreen, split into a vertical stack on smaller screens
      // or a horizontal stack on larger ones!
      templateAreas={{
        base: `"outfit"
               "search"
               "items"`,
        lg: `"outfit search"
             "outfit items"`,
      }}
      templateRows={{
        base: "minmax(100px, 1fr) auto minmax(300px, 1fr)",
        lg: "auto 1fr",
      }}
      templateColumns={{
        base: "100%",
        lg: "50% 50%",
      }}
      position="absolute"
      top="0"
      bottom="0"
      left="0"
      right="0"
    >
      <Box gridArea="outfit">
        <OutfitPreview />
      </Box>
      <Box gridArea="search" boxShadow="sm">
        <Box px="5" py="3">
          <SearchToolbar query={searchQuery} onChange={setSearchQuery} />
        </Box>
      </Box>
      <Box gridArea="items" overflow="auto">
        <Box px="5" py="5">
          {searchQuery ? (
            <SearchPanel
              query={searchQuery}
              wornItemIds={data.wornItemIds}
              onWearItem={wearItem}
            />
          ) : (
            <ItemsPanel
              zonesAndItems={data.zonesAndItems}
              onWearItem={wearItem}
            />
          )}
        </Box>
      </Box>
    </Grid>
  );
}

function OutfitPreview() {
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      height="100%"
      width="100%"
      backgroundColor="gray.900"
    >
      <Image
        src="http://pets.neopets.com/cp/wgmdtdwz/1/7.png"
        maxHeight="100%"
        maxWidth="100%"
      />
    </Flex>
  );
}

function SearchToolbar({ query, onChange }) {
  return (
    <InputGroup>
      <InputLeftElement>
        <Icon name="search" color="gray.400" />
      </InputLeftElement>
      <Input
        placeholder="Search for items to add…"
        focusBorderColor="green.600"
        color="green.800"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            e.target.blur();
          }
        }}
      />
      {query && (
        <InputRightElement>
          <IconButton
            icon="close"
            color="gray.400"
            variant="ghost"
            variantColor="green"
            aria-label="Clear search"
            onClick={() => onChange("")}
          />
        </InputRightElement>
      )}
    </InputGroup>
  );
}

function SearchPanel({ query, wornItemIds, onWearItem }) {
  const normalize = (s) => s.toLowerCase();
  const results = ITEMS.filter((item) =>
    normalize(item.name).includes(normalize(query))
  );
  results.sort((a, b) => a.name.localeCompare(b.name));

  const resultsSection =
    results.length > 0 ? (
      <ItemList
        items={results}
        wornItemIds={wornItemIds}
        onWearItem={onWearItem}
      />
    ) : (
      <Text color="green.500">
        We couldn't find any matching items{" "}
        <span role="img" aria-label="(thinking emoji)">
          🤔
        </span>{" "}
        Try again?
      </Text>
    );

  return (
    <Box color="green.800">
      <Heading1 mb="6">Searching for "{query}"</Heading1>
      {resultsSection}
    </Box>
  );
}

function ItemsPanel({ zonesAndItems, onWearItem }) {
  return (
    <Box color="green.800">
      <OutfitHeading />
      <Stack spacing="10">
        {zonesAndItems.map(({ zoneName, items, wornItemId }) => (
          <Box key={zoneName}>
            <Heading2 mb="3">{zoneName}</Heading2>
            <ItemList
              items={items}
              wornItemIds={[wornItemId]}
              onWearItem={onWearItem}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function OutfitHeading() {
  return (
    <PseudoBox role="group" d="inline-block" position="relative">
      <Heading1 mb="6">
        <Editable defaultValue="Zafara Agent (roopal27)">
          {({ isEditing, onRequestEdit }) => (
            <>
              <EditablePreview />
              <EditableInput />
              {!isEditing && (
                <OutfitNameEditButton onRequestEdit={onRequestEdit} />
              )}
            </>
          )}
        </Editable>
      </Heading1>
    </PseudoBox>
  );
}

function OutfitNameEditButton({ onRequestEdit }) {
  return (
    <PseudoBox
      d="inline-block"
      opacity="0"
      transition="opacity 0.5s"
      _groupHover={{ opacity: "1" }}
      onClick={onRequestEdit}
      position="absolute"
    >
      <IconButton
        icon="edit"
        variant="link"
        color="green.600"
        aria-label="Edit outfit name"
        title="Edit outfit name"
      />
    </PseudoBox>
  );
}

function Heading1({ children, ...props }) {
  return (
    <Heading fontFamily="Delicious" fontWeight="800" size="2xl" {...props}>
      {children}
    </Heading>
  );
}

function Heading2({ children, ...props }) {
  return (
    <Heading size="xl" color="green.800" fontFamily="Delicious" {...props}>
      {children}
    </Heading>
  );
}

export default WardrobePage;
