import React from "react";
import { Box, Image, PseudoBox, Stack } from "@chakra-ui/core";

function ItemList({ items, wornItemIds, onWearItem }) {
  return (
    <Stack spacing="3">
      {items.map((item) => (
        <Box key={item.id}>
          <Item
            item={item}
            isWorn={wornItemIds.includes(item.id)}
            onWear={() => onWearItem(item.id)}
          />
        </Box>
      ))}
    </Stack>
  );
}

function Item({ item, isWorn, onWear }) {
  return (
    <PseudoBox
      role="group"
      d="flex"
      alignItems="center"
      cursor="pointer"
      onClick={onWear}
    >
      <ItemThumbnail src={item.thumbnailSrc} isWorn={isWorn} />
      <Box width="3" />
      <ItemName isWorn={isWorn}>{item.name}</ItemName>
    </PseudoBox>
  );
}

function ItemThumbnail({ src, isWorn }) {
  return (
    <PseudoBox
      rounded="lg"
      boxShadow="md"
      border="1px"
      borderColor={isWorn ? "green.700" : "green.700"}
      opacity={isWorn ? 1 : 0.7}
      width="50px"
      height="50px"
      overflow="hidden"
      transition="all 0.15s"
      transformOrigin="center"
      transform={isWorn ? null : "scale(0.8)"}
      _groupHover={
        !isWorn && {
          opacity: 0.9,
          transform: "scale(0.9)",
          borderColor: "green.600",
        }
      }
    >
      <Image src={src} />
    </PseudoBox>
  );
}

function ItemName({ children, isWorn }) {
  return (
    <PseudoBox
      fontSize="md"
      fontWeight={isWorn && "bold"}
      color="green.800"
      transition="all 0.15s"
      opacity={isWorn ? 1 : 0.8}
      _groupHover={
        !isWorn && {
          color: "green.800",
          fontWeight: "medium",
          opacity: 0.9,
        }
      }
    >
      {children}
    </PseudoBox>
  );
}

export default ItemList;