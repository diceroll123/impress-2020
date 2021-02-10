import React from "react";
import { ClassNames } from "@emotion/react";
import {
  Box,
  Button,
  DarkMode,
  Flex,
  IconButton,
  Portal,
  Stack,
  Tooltip,
  useClipboard,
  useToast,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  CheckIcon,
  DownloadIcon,
  LinkIcon,
} from "@chakra-ui/icons";
import { MdPause, MdPlayArrow } from "react-icons/md";
import { Link } from "react-router-dom";

import { getBestImageUrlForLayer } from "../components/OutfitPreview";
import PosePicker from "./PosePicker";
import SpeciesColorPicker from "../components/SpeciesColorPicker";
import { loadImage, useLocalStorage } from "../util";
import useCurrentUser from "../components/useCurrentUser";
import useOutfitAppearance from "../components/useOutfitAppearance";
import HTML5Badge from "../components/HTML5Badge";

/**
 * OutfitControls is the set of controls layered over the outfit preview, to
 * control things like species/color and sharing links!
 */
function OutfitControls({
  outfitState,
  dispatchToOutfit,
  showAnimationControls,
  appearance,
}) {
  const [focusIsLocked, setFocusIsLocked] = React.useState(false);
  const onLockFocus = React.useCallback(() => setFocusIsLocked(true), [
    setFocusIsLocked,
  ]);
  const onUnlockFocus = React.useCallback(() => setFocusIsLocked(false), [
    setFocusIsLocked,
  ]);

  // HACK: As of 1.0.0-rc.0, Chakra's `toast` function rebuilds unnecessarily,
  //       which triggers unnecessary rebuilds of the `onSpeciesColorChange`
  //       callback, which causes the `React.memo` on `SpeciesColorPicker` to
  //       fail, which harms performance. But it seems to work just fine if we
  //       hold onto the first copy of the function we get! :/
  const _toast = useToast();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toast = React.useMemo(() => _toast, []);

  const onSpeciesColorChange = React.useCallback(
    (species, color, isValid, closestPose) => {
      if (isValid) {
        dispatchToOutfit({
          type: "setSpeciesAndColor",
          speciesId: species.id,
          colorId: color.id,
          pose: closestPose,
        });
      } else {
        // NOTE: This shouldn't be possible to trigger, because the
        //       `stateMustAlwaysBeValid` prop should prevent it. But we have
        //       it as a fallback, just in case!
        toast({
          title: `We haven't seen a ${color.name} ${species.name} before! 😓`,
          status: "warning",
        });
      }
    },
    [dispatchToOutfit, toast]
  );

  const maybeUnlockFocus = (e) => {
    // We lock focus when a touch-device user taps the area. When they tap
    // empty space, we treat that as a toggle and release the focus lock.
    if (e.target === e.currentTarget) {
      onUnlockFocus();
    }
  };

  const itemLayers = appearance.itemAppearances.map((a) => a.layers).flat();
  const usesHTML5 = itemLayers.every(
    (l) => l.svgUrl || l.canvasMovieLibraryUrl
  );

  return (
    <ClassNames>
      {({ css, cx }) => (
        <Box
          role="group"
          pos="absolute"
          left="0"
          right="0"
          top="0"
          bottom="0"
          height="100%" // Required for Safari to size the grid correctly
          padding={{ base: 2, lg: 6 }}
          display="grid"
          overflow="auto"
          gridTemplateAreas={`"back play-pause sharing"
                          "space space space"
                          "picker picker picker"`}
          gridTemplateRows="auto minmax(1rem, 1fr) auto"
          className={cx(
            css`
              opacity: 0;
              transition: opacity 0.2s;

              &:focus-within,
              &.focus-is-locked {
                opacity: 1;
              }

              /* Ignore simulated hovers, only reveal for _real_ hovers. This helps
           * us avoid state conflicts with the focus-lock from clicks. */
              @media (hover: hover) {
                &:hover {
                  opacity: 1;
                }
              }
            `,
            focusIsLocked && "focus-is-locked"
          )}
          onClickCapture={(e) => {
            const opacity = parseFloat(
              getComputedStyle(e.currentTarget).opacity
            );
            if (opacity < 0.5) {
              // If the controls aren't visible right now, then clicks on them are
              // probably accidental. Ignore them! (We prevent default to block
              // built-in behaviors like link nav, and we stop propagation to block
              // our own custom click handlers. I don't know if I can prevent the
              // select clicks though?)
              e.preventDefault();
              e.stopPropagation();

              // We also show the controls, by locking focus. We'll undo this when
              // the user taps elsewhere (because it will trigger a blur event from
              // our child components), in `maybeUnlockFocus`.
              setFocusIsLocked(true);
            }
          }}
        >
          <Box gridArea="back" onClick={maybeUnlockFocus}>
            <BackButton outfitState={outfitState} />
          </Box>
          {showAnimationControls && (
            <Box gridArea="play-pause" display="flex" justifyContent="center">
              <DarkMode>
                <PlayPauseButton />
              </DarkMode>
            </Box>
          )}
          <Stack
            gridArea="sharing"
            alignSelf="flex-end"
            spacing={{ base: "2", lg: "4" }}
            align="flex-end"
            onClick={maybeUnlockFocus}
          >
            <Box>
              <DownloadButton outfitState={outfitState} />
            </Box>
            <Box>
              <CopyLinkButton outfitState={outfitState} />
            </Box>
          </Stack>
          <Box gridArea="space" onClick={maybeUnlockFocus} />
          {outfitState.speciesId && outfitState.colorId && (
            <Flex gridArea="picker" justify="center" onClick={maybeUnlockFocus}>
              {/**
               * We try to center the species/color picker, but the left spacer will
               * shrink more than the pose picker container if we run out of space!
               */}
              <Flex
                flex="1 1 0"
                paddingRight="2"
                align="center"
                justify="center"
              >
                <HTML5Badge
                  usesHTML5={usesHTML5}
                  isLoading={appearance.loading}
                  tooltipLabel={
                    usesHTML5 ? (
                      <>
                        This outfit is converted to HTML5, and ready to use on
                        Neopets.com!
                      </>
                    ) : (
                      <>
                        This outfit isn't converted to HTML5 yet, so it might
                        not appear in Neopets.com customization yet. Once it's
                        ready, it could look a bit different than our temporary
                        preview here. It might even be animated!
                      </>
                    )
                  }
                />
              </Flex>
              <Box flex="0 0 auto">
                <DarkMode>
                  {
                    <SpeciesColorPicker
                      speciesId={outfitState.speciesId}
                      colorId={outfitState.colorId}
                      idealPose={outfitState.pose}
                      onChange={onSpeciesColorChange}
                      stateMustAlwaysBeValid
                    />
                  }
                </DarkMode>
              </Box>
              <Flex flex="1 1 0" align="center" pl="4">
                <PosePicker
                  speciesId={outfitState.speciesId}
                  colorId={outfitState.colorId}
                  pose={outfitState.pose}
                  appearanceId={outfitState.appearanceId}
                  dispatchToOutfit={dispatchToOutfit}
                  onLockFocus={onLockFocus}
                  onUnlockFocus={onUnlockFocus}
                />
              </Flex>
            </Flex>
          )}
        </Box>
      )}
    </ClassNames>
  );
}

/**
 * BackButton takes you back home, or to Your Outfits if this outfit is yours.
 */
function BackButton({ outfitState }) {
  const currentUser = useCurrentUser();
  const outfitBelongsToCurrentUser =
    outfitState.creator && outfitState.creator.id === currentUser.id;

  return (
    <ControlButton
      as={Link}
      to={outfitBelongsToCurrentUser ? "/your-outfits" : "/"}
      icon={<ArrowBackIcon />}
      aria-label="Leave this outfit"
      d="inline-flex" // Not sure why <a> requires this to style right! ^^`
    />
  );
}

/**
 * DownloadButton downloads the outfit as an image!
 */
function DownloadButton({ outfitState }) {
  const { visibleLayers } = useOutfitAppearance(outfitState);

  const [downloadImageUrl, prepareDownload] = useDownloadableImage(
    visibleLayers
  );

  return (
    <Tooltip label="Download" placement="left">
      <Box>
        <ControlButton
          icon={<DownloadIcon />}
          aria-label="Download"
          as="a"
          // eslint-disable-next-line no-script-url
          href={downloadImageUrl || "#"}
          onClick={(e) => {
            if (!downloadImageUrl) {
              e.preventDefault();
            }
          }}
          download={(outfitState.name || "Outfit") + ".png"}
          onMouseEnter={prepareDownload}
          onFocus={prepareDownload}
          cursor={!downloadImageUrl && "wait"}
        />
      </Box>
    </Tooltip>
  );
}

/**
 * CopyLinkButton copies the outfit URL to the clipboard!
 */
function CopyLinkButton({ outfitState }) {
  const { onCopy, hasCopied } = useClipboard(outfitState.url);

  return (
    <Tooltip label={hasCopied ? "Copied!" : "Copy link"} placement="left">
      <Box>
        <ControlButton
          icon={hasCopied ? <CheckIcon /> : <LinkIcon />}
          aria-label="Copy link"
          onClick={onCopy}
        />
      </Box>
    </Tooltip>
  );
}

function PlayPauseButton() {
  const [isPaused, setIsPaused] = useLocalStorage("DTIOutfitIsPaused", true);

  // We show an intro animation if this mounts while paused. Whereas if we're
  // not paused, we initialize as if we had already finished.
  const [blinkInState, setBlinkInState] = React.useState(
    isPaused ? { type: "ready" } : { type: "done" }
  );
  const buttonRef = React.useRef(null);

  React.useLayoutEffect(() => {
    if (blinkInState.type === "ready" && buttonRef.current) {
      setBlinkInState({
        type: "started",
        position: {
          left: buttonRef.current.offsetLeft,
          top: buttonRef.current.offsetTop,
        },
      });
    }
  }, [blinkInState, setBlinkInState]);

  return (
    <ClassNames>
      {({ css }) => (
        <>
          <PlayPauseButtonContent
            isPaused={isPaused}
            setIsPaused={setIsPaused}
            marginTop="0.3rem" // to center-align with buttons (not sure on amt?)
            ref={buttonRef}
          />
          {blinkInState.type === "started" && (
            <Portal>
              <PlayPauseButtonContent
                isPaused={isPaused}
                setIsPaused={setIsPaused}
                position="absolute"
                left={blinkInState.position.left}
                top={blinkInState.position.top}
                backgroundColor="gray.600"
                borderColor="gray.50"
                color="gray.50"
                onAnimationEnd={() => setBlinkInState({ type: "done" })}
                // Don't disrupt the hover state of the controls! (And the button
                // doesn't seem to click correctly, not sure why, but instead of
                // debugging I'm adding this :p)
                pointerEvents="none"
                className={css`
                  @keyframes fade-in-out {
                    0% {
                      opacity: 0;
                    }

                    10% {
                      opacity: 1;
                    }

                    90% {
                      opacity: 1;
                    }

                    100% {
                      opacity: 0;
                    }
                  }

                  opacity: 0;
                  animation: fade-in-out 2s;
                `}
              />
            </Portal>
          )}
        </>
      )}
    </ClassNames>
  );
}

const PlayPauseButtonContent = React.forwardRef(
  ({ isPaused, setIsPaused, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        leftIcon={isPaused ? <MdPause /> : <MdPlayArrow />}
        size="sm"
        color="gray.100"
        variant="outline"
        borderColor="gray.200"
        borderRadius="full"
        backgroundColor="blackAlpha.600"
        boxShadow="md"
        position="absolute"
        _hover={{
          backgroundColor: "gray.600",
          borderColor: "gray.50",
          color: "gray.50",
        }}
        _focus={{
          backgroundColor: "gray.600",
          borderColor: "gray.50",
          color: "gray.50",
        }}
        onClick={() => setIsPaused(!isPaused)}
        {...props}
      >
        {isPaused ? <>Paused</> : <>Playing</>}
      </Button>
    );
  }
);

/**
 * ControlButton is a UI helper to render the cute round buttons we use in
 * OutfitControls!
 */
function ControlButton({ icon, "aria-label": ariaLabel, ...props }) {
  return (
    <IconButton
      icon={icon}
      aria-label={ariaLabel}
      isRound
      variant="unstyled"
      backgroundColor="gray.600"
      color="gray.50"
      boxShadow="md"
      d="flex"
      alignItems="center"
      justifyContent="center"
      transition="backgroundColor 0.2s"
      _focus={{ backgroundColor: "gray.500" }}
      _hover={{ backgroundColor: "gray.500" }}
      outline="initial"
      {...props}
    />
  );
}

/**
 * useDownloadableImage loads the image data and generates the downloadable
 * image URL.
 */
function useDownloadableImage(visibleLayers) {
  const [downloadImageUrl, setDownloadImageUrl] = React.useState(null);
  const [preparedForLayerIds, setPreparedForLayerIds] = React.useState([]);
  const toast = useToast();

  const prepareDownload = React.useCallback(async () => {
    // Skip if the current image URL is already correct for these layers.
    const layerIds = visibleLayers.map((l) => l.id);
    if (layerIds.join(",") === preparedForLayerIds.join(",")) {
      return;
    }

    // Skip if there are no layers. (This probably means we're still loading!)
    if (layerIds.length === 0) {
      return;
    }

    setDownloadImageUrl(null);

    const imagePromises = visibleLayers.map((layer) =>
      loadImage(getBestImageUrlForLayer(layer))
    );

    let images;
    try {
      images = await Promise.all(imagePromises);
    } catch (e) {
      console.error("Error building downloadable image", e);
      toast({
        status: "error",
        title: "Oops, sorry, we couldn't download the image!",
        description:
          "Check your connection, then reload the page and try again.",
      });
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 600;
    canvas.height = 600;

    for (const image of images) {
      context.drawImage(image, 0, 0);
    }

    console.log(
      "Generated image for download",
      layerIds,
      canvas.toDataURL("image/png")
    );
    setDownloadImageUrl(canvas.toDataURL("image/png"));
    setPreparedForLayerIds(layerIds);
  }, [preparedForLayerIds, visibleLayers, toast]);

  return [downloadImageUrl, prepareDownload];
}

export default OutfitControls;
