// Loads an asset for a three.js scene (a model, a texture, a font) while
// holding the render readiness gate, so no frame is captured without it.

import { useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender } from "../../render/ready";

/**
 * Runs `load` once per `label` and returns its result, `undefined` until it
 * resolves. A rejection fails the render (`cancelRender`).
 *
 * The gate handle is released by the effect's cleanup, which runs in the
 * commit that first renders the loaded asset (`loaded` is a dependency). The
 * render page does not draw the frame again once the gate is idle, and React
 * commits a promise-scheduled update later than the promise callback, so
 * releasing straight after `setState` could let the frame be captured
 * without the asset. Released inside the commit instead, the whole commit,
 * including every layout effect that draws the asset (a `ThreeStage`'s
 * render), has run before anything awaiting the gate resumes.
 *
 * After a failure the handle is kept until unmount: releasing it would settle
 * the gate and forget the error before the driver waits on it. Unmounting
 * mid-load releases the handle and ignores the result.
 */
export function useThreeAsset<T>(label: string, load: () => Promise<T>): T | undefined {
  const [result, setResult] = useState<{ label: string; value: T } | undefined>(undefined);
  // The load in flight, kept across StrictMode's effect replay so it starts once.
  const started = useRef<{ label: string; promise: Promise<T> } | undefined>(undefined);
  const loaded = result?.label === label;

  useLayoutEffect(() => {
    if (loaded) return;
    const handle = delayRender(`three: ${label}`);
    let active = true;
    // A `load` that throws instead of rejecting fails the render the same way.
    if (started.current?.label !== label) started.current = { label, promise: new Promise<T>((resolve) => resolve(load())) };
    started.current.promise.then(
      (value) => {
        if (active) setResult({ label, value });
      },
      (error: unknown) => {
        if (active) cancelRender(error);
      },
    );
    return () => {
      active = false;
      continueRender(handle);
    };
    // `load` is keyed by `label`: a new function each render does not reload.
  }, [label, loaded]);

  return loaded ? result.value : undefined;
}
