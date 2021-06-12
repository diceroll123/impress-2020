import React from "react";
import {
  Box,
  Flex,
  Grid,
  Heading,
  Link,
  useColorModeValue,
} from "@chakra-ui/react";
import loadableLibrary from "@loadable/component";
import * as Sentry from "@sentry/react";

import ErrorGrundoImg from "./images/error-grundo.png";
import ErrorGrundoImg2x from "./images/error-grundo@2x.png";
import { WarningIcon } from "@chakra-ui/icons";

/**
 * Delay hides its content at first, then shows it after the given delay.
 *
 * This is useful for loading states: it can be disruptive to see a spinner or
 * skeleton element for only a brief flash, we'd rather just show them if
 * loading is genuinely taking a while!
 *
 * 300ms is a pretty good default: that's about when perception shifts from "it
 * wasn't instant" to "the process took time".
 * https://developers.google.com/web/fundamentals/performance/rail
 */
export function Delay({ children, ms = 300 }) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setIsVisible(true), ms);
    return () => clearTimeout(id);
  }, [ms, setIsVisible]);

  return (
    <Box opacity={isVisible ? 1 : 0} transition="opacity 0.5s">
      {children}
    </Box>
  );
}

/**
 * Heading1 is a large, page-title-ish heading, with our DTI-brand-y Delicious
 * font and some special typographical styles!
 */
export function Heading1({ children, ...props }) {
  return (
    <Heading
      as="h1"
      size="2xl"
      fontFamily="Delicious, sans-serif"
      fontWeight="800"
      {...props}
    >
      {children}
    </Heading>
  );
}

/**
 * Heading2 is a major subheading, with our DTI-brand-y Delicious font and some
 * special typographical styles!!
 */
export function Heading2({ children, ...props }) {
  return (
    <Heading
      as="h2"
      size="xl"
      fontFamily="Delicious, sans-serif"
      fontWeight="700"
      {...props}
    >
      {children}
    </Heading>
  );
}

/**
 * Heading2 is a minor subheading, with our DTI-brand-y Delicious font and some
 * special typographical styles!!
 */
export function Heading3({ children, ...props }) {
  return (
    <Heading
      as="h3"
      size="lg"
      fontFamily="Delicious, sans-serif"
      fontWeight="700"
      {...props}
    >
      {children}
    </Heading>
  );
}

/**
 * ErrorMessage is a simple error message for simple errors!
 */
export function ErrorMessage({ children, ...props }) {
  return (
    <Box color="red.400" {...props}>
      {children}
    </Box>
  );
}

export function useCommonStyles() {
  return {
    brightBackground: useColorModeValue("white", "gray.700"),
    bodyBackground: useColorModeValue("gray.50", "gray.800"),
  };
}

/**
 * safeImageUrl returns an HTTPS-safe image URL for Neopets assets!
 */
export function safeImageUrl(urlString) {
  if (urlString == null) {
    return urlString;
  }

  let url;
  try {
    url = new URL(
      urlString,
      // A few item thumbnail images incorrectly start with "/". When that
      // happens, the correct URL is at images.neopets.com.
      //
      // So, we provide "http://images.neopets.com" as the base URL when
      // parsing. Most URLs are absolute and will ignore it, but relative URLs
      // will resolve relative to that base.
      "http://images.neopets.com"
    );
  } catch (e) {
    logAndCapture(
      new Error(
        `safeImageUrl could not parse URL: ${urlString}. Returning a placeholder.`
      )
    );
    return "https://impress-2020.openneo.net/__error__URL-was-not-parseable__";
  }

  if (url.origin === "http://images.neopets.com") {
    url.protocol = "https:";
    url.host = "images.neopets-asset-proxy.openneo.net";
  } else if (url.origin === "http://pets.neopets.com") {
    url.protocol = "https:";
    url.host = "pets.neopets-asset-proxy.openneo.net";
  }

  if (url.protocol !== "https:") {
    logAndCapture(
      new Error(
        `safeImageUrl was provided an unsafe URL, but we don't know how to ` +
          `upgrade it to HTTPS: ${urlString}. Returning a placeholder.`
      )
    );
    return "https://impress-2020.openneo.net/__error__URL-was-not-HTTPS__";
  }

  return url.toString();
}

/**
 * useDebounce helps make a rapidly-changing value change less! It waits for a
 * pause in the incoming data before outputting the latest value.
 *
 * We use it in search: when the user types rapidly, we don't want to update
 * our query and send a new request every keystroke. We want to wait for it to
 * seem like they might be done, while still feeling responsive!
 *
 * Adapted from https://usehooks.com/useDebounce/
 */
export function useDebounce(
  value,
  delay,
  { waitForFirstPause = false, initialValue = null, forceReset = null } = {}
) {
  // State and setters for debounced value
  const [debouncedValue, setDebouncedValue] = React.useState(
    waitForFirstPause ? initialValue : value
  );

  React.useEffect(
    () => {
      // Update debounced value after delay
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      // Cancel the timeout if value changes (also on delay change or unmount)
      // This is how we prevent debounced value from updating if value is changed ...
      // .. within the delay period. Timeout gets cleared and restarted.
      return () => {
        clearTimeout(handler);
      };
    },
    [value, delay] // Only re-call effect if value or delay changes
  );

  // The `forceReset` option helps us decide whether to set the value
  // immediately! We'll update it in an effect for consistency and clarity, but
  // also return it immediately rather than wait a tick.
  const shouldForceReset = forceReset && forceReset(debouncedValue, value);
  React.useEffect(() => {
    if (shouldForceReset) {
      setDebouncedValue(value);
    }
  }, [shouldForceReset, value]);

  return shouldForceReset ? value : debouncedValue;
}

/**
 * usePageTitle sets the page title!
 */
export function usePageTitle(title, { skip = false } = {}) {
  React.useEffect(() => {
    if (skip) return;
    try {
      document.title = title
        ? `${title} | Dress to Impress`
        : "Dress to Impress";
    } catch (e) {
      // I've been seeing Sentry errors that we can't read `title` of
      // undefined, with no traceback. This is the only `.title` I see in our
      // codebase, aside from unpacking props that I'm pretty sure aren't
      // null... so I'm adding this to help confirm!
      logAndCapture(
        new Error(
          `Could not set page title: ${e.message}. Document is: ${document}.`
        )
      );
    }
  }, [title, skip]);
}

/**
 * useFetch uses `fetch` to fetch the given URL, and returns the request state.
 *
 * Our limited API is designed to match the `use-http` library!
 */
export function useFetch(url, { responseType, skip, ...fetchOptions }) {
  // Just trying to be clear about what you'll get back ^_^` If we want to
  // fetch non-binary data later, extend this and get something else from res!
  if (responseType !== "arrayBuffer") {
    throw new Error(`unsupported responseType ${responseType}`);
  }

  const [response, setResponse] = React.useState({
    loading: skip ? false : true,
    error: null,
    data: null,
  });

  // We expect this to be a simple object, so this helps us only re-send the
  // fetch when the options have actually changed, rather than e.g. a new copy
  // of an identical object!
  const fetchOptionsAsJson = JSON.stringify(fetchOptions);

  React.useEffect(() => {
    if (skip) {
      return;
    }

    let canceled = false;

    fetch(url, JSON.parse(fetchOptionsAsJson))
      .then(async (res) => {
        if (canceled) {
          return;
        }

        const arrayBuffer = await res.arrayBuffer();
        setResponse({ loading: false, error: null, data: arrayBuffer });
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        setResponse({ loading: false, error, data: null });
      });

    return () => {
      canceled = true;
    };
  }, [skip, url, fetchOptionsAsJson]);

  return response;
}

/**
 * useLocalStorage is like React.useState, but it persists the value in the
 * device's `localStorage`, so it comes back even after reloading the page.
 *
 * Adapted from https://usehooks.com/useLocalStorage/.
 */
let storageListeners = [];
export function useLocalStorage(key, initialValue) {
  const loadValue = React.useCallback(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = React.useState(loadValue);

  const setValue = React.useCallback(
    (value) => {
      try {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
        storageListeners.forEach((l) => l());
      } catch (error) {
        console.error(error);
      }
    },
    [key]
  );

  const reloadValue = React.useCallback(() => {
    setStoredValue(loadValue());
  }, [loadValue, setStoredValue]);

  // Listen for changes elsewhere on the page, and update here too!
  React.useEffect(() => {
    storageListeners.push(reloadValue);
    return () => {
      storageListeners = storageListeners.filter((l) => l !== reloadValue);
    };
  }, [reloadValue]);

  // Listen for changes in other tabs, and update here too! (This does not
  // catch same-page updates!)
  React.useEffect(() => {
    window.addEventListener("storage", reloadValue);
    return () => window.removeEventListener("storage", reloadValue);
  }, [reloadValue]);

  return [storedValue, setValue];
}

export function loadImage({ src, crossOrigin = null }) {
  const image = new Image();
  const promise = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Failed to load image: ${JSON.stringify(src)}`));
    if (crossOrigin) {
      image.crossOrigin = crossOrigin;
    }
    image.src = src;
  });
  promise.cancel = () => {
    image.src = "";
  };
  return promise;
}

/**
 * loadable is a wrapper for `@loadable/component`, with extra error handling.
 * Loading the page will often fail if you keep a session open during a deploy,
 * because Vercel doesn't keep old JS chunks on the CDN. Recover by reloading!
 */
export function loadable(load, options) {
  return loadableLibrary(
    () =>
      load().catch((e) => {
        console.error("Error loading page, reloading:", e);
        window.location.reload();
        // Return a component that renders nothing, while we reload!
        return () => null;
      }),
    options
  );
}

/**
 * logAndCapture will print an error to the console, and send it to Sentry.
 *
 * This is useful when there's a graceful recovery path, but it's still a
 * genuinely unexpected error worth logging.
 */
export function logAndCapture(e) {
  console.error(e);
  Sentry.captureException(e);
}

export function MajorErrorMessage({ error = null, variant = "unexpected" }) {
  // If this is a GraphQL Bad Request error, show the message of the first
  // error the server returned. Otherwise, just use the normal error message!
  const message =
    error?.networkError?.result?.errors?.[0]?.message || error?.message || null;

  // Log the detailed error to the console, so we can have a good debug
  // experience without the parent worrying about it!
  React.useEffect(() => {
    if (error) {
      console.error(error);
    }
  }, [error]);

  return (
    <Flex justify="center" marginTop="8">
      <Grid
        templateAreas='"icon title" "icon description" "icon details"'
        templateColumns="auto minmax(0, 1fr)"
        maxWidth="500px"
        marginX="8"
        columnGap="4"
      >
        <Box gridArea="icon" marginTop="2">
          <Box
            as="img"
            src={ErrorGrundoImg}
            srcSet={`${ErrorGrundoImg} 1x, ${ErrorGrundoImg2x} 2x`}
            borderRadius="full"
            boxShadow="md"
            width="100px"
            height="100px"
            alt=""
          />
        </Box>
        <Box gridArea="title" fontSize="lg" marginBottom="1">
          {variant === "unexpected" && <>Ah dang, I broke it 😖</>}
          {variant === "network" && <>Oops, it didn't work, sorry 😖</>}
          {variant === "not-found" && <>Oops, page not found 😖</>}
        </Box>
        <Box gridArea="description" marginBottom="2">
          {variant === "unexpected" && (
            <>
              There was an error displaying this page. I'll get info about it
              automatically, but you can tell me more at{" "}
              <Link href="mailto:matchu@openneo.net" color="green.400">
                matchu@openneo.net
              </Link>
              !
            </>
          )}
          {variant === "network" && (
            <>
              There was an error displaying this page. Check your internet
              connection and try again—and if you keep having trouble, please
              tell me more at{" "}
              <Link href="mailto:matchu@openneo.net" color="green.400">
                matchu@openneo.net
              </Link>
              !
            </>
          )}
          {variant === "not-found" && (
            <>
              We couldn't find this page. Maybe it's been deleted? Check the URL
              and try again—and if you keep having trouble, please tell me more
              at{" "}
              <Link href="mailto:matchu@openneo.net" color="green.400">
                matchu@openneo.net
              </Link>
              !
            </>
          )}
        </Box>
        {message && (
          <Box gridArea="details" fontSize="xs" opacity="0.8">
            <WarningIcon
              marginRight="1.5"
              marginTop="-2px"
              aria-label="Error message"
            />
            "{message}"
          </Box>
        )}
      </Grid>
    </Flex>
  );
}

export function TestErrorSender() {
  React.useEffect(() => {
    if (window.location.href.includes("send-test-error-for-sentry")) {
      throw new Error("Test error for Sentry");
    }
  });

  return null;
}
