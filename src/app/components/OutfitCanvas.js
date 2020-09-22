import React from "react";

import { safeImageUrl } from "../util";

const EaselContext = React.createContext({
  stage: null,
  addResizeListener: () => {},
  removeResizeListener: () => {},
});

function OutfitCanvas({ children, width, height }) {
  const [stage, setStage] = React.useState(null);
  const resizeListenersRef = React.useRef([]);
  const canvasRef = React.useRef(null);

  const { loading } = useEaselDependenciesLoader();

  React.useLayoutEffect(() => {
    if (loading) {
      return;
    }

    const stage = new window.createjs.Stage(canvasRef.current);
    setStage(stage);

    function onTick(event) {
      stage.update(event);
    }

    window.createjs.Ticker.timingMode = window.createjs.Ticker.RAF;
    window.createjs.Ticker.addEventListener("tick", onTick);

    return () => window.createjs.Ticker.removeEventListener("tick", onTick);
  }, [loading]);

  const addChild = React.useCallback(
    (child, zIndex, { afterFirstDraw = null } = {}) => {
      // Save this child's z-index for future sorting.
      child.DTI_zIndex = zIndex;
      // Add the child, then slot it into the right place in the order.
      stage.addChild(child);
      stage.sortChildren((a, b) => a.DTI_zIndex - b.DTI_zIndex);
      if (afterFirstDraw) {
        stage.on("drawend", afterFirstDraw, null, true);
      }
      // NOTE: We don't bother firing an update, because we trust the ticker
      //       to do it on the next frame.
    },
    [stage]
  );

  const removeChild = React.useCallback(
    (child) => {
      stage.removeChild(child);
      // NOTE: We don't bother firing an update, because we trust the ticker
      //       to do it on the next frame. (And, I don't understand why, but
      //       updating here actually paused remaining movies! So, don't!)
    },
    [stage]
  );

  const addResizeListener = React.useCallback((handler) => {
    resizeListenersRef.current.push(handler);
  }, []);
  const removeResizeListener = React.useCallback((handler) => {
    resizeListenersRef.current = resizeListenersRef.current.filter(
      (h) => h !== handler
    );
  }, []);

  // When the canvas resizes, resize all the layers, then a single bulk update.
  React.useEffect(() => {
    for (const handler of resizeListenersRef.current) {
      handler();
    }
    if (stage) {
      stage.update();
    }
  }, [stage, width, height]);

  // Set the canvas's internal dimensions to be higher, if the device has high
  // DPI like retina. But we'll keep the layout width/height as expected!
  const internalWidth = width * window.devicePixelRatio;
  const internalHeight = height * window.devicePixelRatio;

  if (loading) {
    return null;
  }

  return (
    <EaselContext.Provider
      value={{
        width: internalWidth,
        height: internalHeight,
        addChild,
        removeChild,
        addResizeListener,
        removeResizeListener,
        stage, // Not used, but available for debugging.
      }}
    >
      <canvas
        ref={canvasRef}
        width={internalWidth}
        height={internalHeight}
        style={{
          width: width + "px",
          height: height + "px",
        }}
      />
      {stage && children}
    </EaselContext.Provider>
  );
}

export function OutfitCanvasImage({ src, zIndex }) {
  const {
    width,
    height,
    addChild,
    removeChild,
    addResizeListener,
    removeResizeListener,
  } = React.useContext(EaselContext);

  React.useEffect(() => {
    let image;
    let bitmap;
    let tween;

    function setBitmapSize() {
      bitmap.scaleX = width / image.width;
      bitmap.scaleY = height / image.height;
    }

    async function addBitmap() {
      image = await loadImage(src);
      bitmap = new window.createjs.Bitmap(image);

      // We're gonna fade in! Wait for the first frame to draw, to make the
      // timing smooth, but yeah here we go!
      bitmap.alpha = 0;
      tween = window.createjs.Tween.get(bitmap, { paused: true }).to(
        { alpha: 1 },
        200
      );
      const startFadeIn = () => {
        // NOTE: You must cache bitmaps to apply filters to them, and caching
        //       doesn't work until the first draw.
        bitmap.cache(0, 0, image.width, image.height);
        tween.paused = false;
      };

      setBitmapSize();
      addChild(bitmap, zIndex, { afterFirstDraw: startFadeIn });
      addResizeListener(setBitmapSize);
    }

    function removeBitmap() {
      removeResizeListener(setBitmapSize);
      removeChild(bitmap);
    }

    addBitmap();

    return () => {
      if (bitmap) {
        // Reverse the fade-in into a fade-out, then remove the bitmap.
        tween.reversed = true;
        tween.setPosition(0);
        tween.paused = false;
        tween.on("complete", removeBitmap, null, true);
      }
    };
  }, [
    src,
    zIndex,
    width,
    height,
    addChild,
    removeChild,
    addResizeListener,
    removeResizeListener,
  ]);

  return null;
}

export function OutfitCanvasMovie({ librarySrc, zIndex }) {
  const {
    width,
    height,
    addChild,
    removeChild,
    addResizeListener,
    removeResizeListener,
  } = React.useContext(EaselContext);

  React.useEffect(() => {
    let library;
    let movieClip;
    let tween;

    function updateSize() {
      movieClip.scaleX = width / library.properties.width;
      movieClip.scaleY = height / library.properties.height;
    }

    async function addMovieClip() {
      library = await loadMovieLibrary(librarySrc);
      let constructorName;
      try {
        const fileName = librarySrc.split("/").pop();
        const fileNameWithoutExtension = fileName.split(".")[0];
        constructorName = fileNameWithoutExtension.replace(/[ -]/g, "");
      } catch (e) {
        console.error(
          `Movie librarySrc %s did not match expected format: %o`,
          JSON.stringify(librarySrc),
          e
        );
        return;
      }

      const LibraryMovieClipConstructor = library[constructorName];
      if (!LibraryMovieClipConstructor) {
        console.error(
          `Expected JS movie library %s to contain a constructor named ` +
            `%s, but it did not: %o`,
          JSON.stringify(librarySrc),
          JSON.stringify(constructorName),
          library
        );
        return;
      }
      movieClip = new LibraryMovieClipConstructor();
      movieClip.cache(
        0,
        0,
        library.properties.width,
        library.properties.height
      );
      movieClip.on("tick", () => {
        console.log("clip tick", movieClip.framerate, movieClip.currentFrame);
        movieClip.updateCache();
      });

      // We're gonna fade in! Wait for the first frame to draw, to make the
      // timing smooth, but yeah here we go!
      movieClip.alpha = 0;
      tween = window.createjs.Tween.get(movieClip, { paused: true }).to(
        { alpha: 1 },
        200
      );
      const startFadeIn = () => {
        console.log("first draw");
        tween.paused = false;
      };

      // Get it actually running! We need to set framerate _after_ adding it
      // to the stage, to overwrite the stage's defaults.
      updateSize();
      addChild(movieClip, zIndex, { afterFirstDraw: startFadeIn });
      movieClip.framerate = library.properties.fps;

      addResizeListener(updateSize);
    }

    function removeMovieClip() {
      removeResizeListener(updateSize);
      removeChild(movieClip);
    }

    addMovieClip();

    return () => {
      if (movieClip) {
        // Reverse the fade-in into a fade-out, then remove the bitmap.
        tween.reversed = true;
        tween.setPosition(0);
        tween.paused = false;
        tween.on("complete", removeMovieClip, null, true);
      }
    };
  }, [
    librarySrc,
    zIndex,
    width,
    height,
    addChild,
    removeChild,
    addResizeListener,
    removeResizeListener,
  ]);

  return null;
}

/**
 * useEaselDependenciesLoader loads the CreateJS scripts we use in OutfitCanvas.
 * We load it as part of OutfitCanvas, but callers can also use this to preload
 * the scripts and track loading progress.
 */
export function useEaselDependenciesLoader() {
  // NOTE: I couldn't find an official NPM source for this that worked with
  //       Webpack, and I didn't want to rely on random people's ports, and I
  //       couldn't get a bundled version to work quite right. So we load
  //       createjs async!
  const easelLoading = useScriptTag(
    "https://code.createjs.com/1.0.0/easeljs.min.js"
  );
  const tweenLoading = useScriptTag(
    "https://code.createjs.com/1.0.0/tweenjs.min.js"
  );

  return { loading: easelLoading || tweenLoading };
}

function useScriptTag(src) {
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const existingScript = document.querySelector(
      `script[src=${CSS.escape(src)}]`
    );
    if (existingScript) {
      setLoading(false);
      return;
    }

    let canceled = false;
    loadScriptTag(src).then(() => {
      if (!canceled) {
        setLoading(false);
      }
    });

    return () => {
      canceled = true;
      setLoading(true);
    };
  }, [src, setLoading]);

  return loading;
}

export function loadImage(url) {
  const image = new Image();
  const promise = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = (e) => reject(e);
    image.src = url;
  });
  promise.cancel = () => {
    image.src = "";
  };
  return promise;
}

async function loadMovieLibrary(librarySrc) {
  // These library JS files are interesting in their operation. It seems like
  // the idea is, it pushes an object to a global array, and you need to snap
  // it up and see it at the end of the array! And I don't really see a way to
  // like, get by a name or ID that we know by this point. So, here we go, just
  // try to grab it once it arrives!
  //
  // TODO: How reliable is the timing on this? My assumption is that, the
  //       scripts will trigger their onloads in order of arrival, and my
  //       _hope_ is that the onload will execute before the next script to
  //       arrive executes. Let's, ah, find out!
  await loadScriptTag(librarySrc);
  const composition = Object.values(window.AdobeAn.compositions).pop();
  const library = composition.getLibrary();

  // One more loading step as part of loading this library is loading the
  // images it uses for sprites.
  //
  // TODO: I guess the manifest has these too, so if we could use our DB cache
  //       to get the manifest to us faster, then we could avoid a network RTT
  //       on the critical path by preloading these images before the JS file
  //       even gets to us?
  const librarySrcDir = librarySrc.split("/").slice(0, -1).join("/");
  const manifestImages = new Map(
    library.properties.manifest.map(({ id, src }) => [
      id,
      loadImage(safeImageUrl(librarySrcDir + "/" + src)),
    ])
  );
  await Promise.all(manifestImages.values());

  // Finally, once we have the images loaded, the library object expects us to
  // mutate it (!) to give it the actual sprite sheet objects based on the
  // loaded images. That's how the MovieClip's objects will access the loaded
  // versions!
  const spriteSheets = composition.getSpriteSheet();
  for (const { name, frames } of library.ssMetadata) {
    const image = await manifestImages.get(name);
    spriteSheets[name] = new window.createjs.SpriteSheet({
      images: [image],
      frames,
    });
  }

  return library;
}

function loadScriptTag(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.onload = () => resolve(script);
    script.onerror = (e) => reject(e);
    script.src = src;
    document.body.appendChild(script);
  });
}

export default OutfitCanvas;
