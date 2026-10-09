// The render readiness gate: a frame is captured only once its fonts are
// loaded, its images are decoded and every piece of registered async work
// (`delayRender`) has been released. Never captures early; after a timeout it
// fails with an error naming exactly what never became ready.

/** How long a frame may take to become ready before rendering fails. */
export const READY_TIMEOUT_MS = 30_000;

export interface ReadyGate {
  /** Registers async work the frame must wait for. Returns a handle for `continueRender`. */
  delayRender(label: string): number;
  /** Releases a handle from `delayRender`. */
  continueRender(handle: number): void;
  /** Fails the current (or next) wait with `error`, e.g. when a video cannot load. */
  cancelRender(error: unknown): void;
  /** Labels of the handles not yet released, oldest first. */
  pending(): string[];
  /** Resolves when no handle is pending; rejects after `cancelRender`. */
  idle(): Promise<void>;
}

export function createReadyGate(): ReadyGate {
  const handles = new Map<number, string>();
  let nextHandle = 1;
  let cancelled: { error: unknown } | undefined;
  let waiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];

  const settle = () => {
    if (cancelled === undefined && handles.size > 0) return;
    const current = waiters;
    waiters = [];
    for (const waiter of current) {
      if (cancelled !== undefined) waiter.reject(cancelled.error);
      else waiter.resolve();
    }
    cancelled = undefined;
  };

  return {
    delayRender(label) {
      const handle = nextHandle++;
      handles.set(handle, label);
      return handle;
    },
    continueRender(handle) {
      if (!handles.delete(handle)) throw new Error(`continueRender: unknown or already released handle ${handle}`);
      settle();
    },
    cancelRender(error) {
      cancelled = { error };
      if (waiters.length > 0) settle();
    },
    pending: () => [...handles.values()],
    idle() {
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
        settle();
      });
    },
  };
}

/**
 * Loads every CSS font request with `load` (`document.fonts.load` in the page)
 * and fails naming each request that no face matched: a weight with no face
 * would otherwise be drawn in a neighbouring weight or a fallback font.
 */
export async function loadFonts(requests: readonly string[], load: (font: string) => Promise<readonly unknown[]>): Promise<void> {
  const loaded = await Promise.all(requests.map(async (font) => ({ font, faces: await load(font) })));
  const missing = loaded.filter(({ faces }) => faces.length === 0).map(({ font }) => font);
  if (missing.length > 0) throw new Error(`no bundled face for ${missing.join(", ")}`);
}

/** An image on the frame: `decode` resolves once it can be painted. */
export interface ReadyImage {
  label: string;
  decode(): Promise<void>;
}

/** What the gate waits for besides `delayRender` handles. */
export interface ReadySources {
  /** Resolves when fonts have loaded (`document.fonts.ready` in the page). */
  fonts(): Promise<unknown>;
  images(): readonly ReadyImage[];
}

export class RenderNotReadyError extends Error {
  constructor(
    public readonly pending: readonly string[],
    public readonly timeoutMs: number,
  ) {
    super(`frame was not ready after ${timeoutMs} ms; still waiting for: ${pending.join(", ")}`);
    this.name = "RenderNotReadyError";
  }
}

/** Waits until fonts, images and `gate` are all ready, or fails after `timeoutMs`. */
export async function waitUntilReady(gate: ReadyGate, sources: ReadySources, timeoutMs: number): Promise<void> {
  const waiting = new Set<string>();
  const track = (label: string, work: () => Promise<unknown>, describeFailure = true): Promise<void> => {
    waiting.add(label);
    return Promise.resolve()
      .then(work)
      .then(
        () => void waiting.delete(label),
        (error: unknown) => {
          if (!describeFailure) throw error;
          throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
        },
      );
  };

  const tasks = [
    track("fonts", sources.fonts),
    ...sources.images().map((image) => track(`image "${image.label}"`, () => image.decode())),
    track("delayRender", () => gate.idle(), false),
  ];

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Name each unreleased handle rather than the gate as a whole.
      const pending = [...waiting].filter((label) => label !== "delayRender");
      if (waiting.has("delayRender")) pending.push(...gate.pending().map((label) => `delayRender("${label}")`));
      reject(new RenderNotReadyError(pending, timeoutMs));
    }, timeoutMs);
  });
  try {
    await Promise.race([Promise.all(tasks), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The page's gate: components register async work here (see `delayRender`). */
export const pageGate: ReadyGate = createReadyGate();

/** Holds frame capture until `continueRender(handle)` (e.g. a video frame still decoding). */
export function delayRender(label: string): number {
  return pageGate.delayRender(label);
}

export function continueRender(handle: number): void {
  pageGate.continueRender(handle);
}

/** Fails the render with `error`, for async work that cannot complete. */
export function cancelRender(error: unknown): void {
  pageGate.cancelRender(error);
}

/** Every <img> under `root` that has a source, as gate images. */
export function domImages(root: ParentNode): ReadyImage[] {
  return [...root.querySelectorAll("img")]
    .filter((img) => img.getAttribute("src"))
    .map((img) => ({ label: shorten(img.getAttribute("src")!), decode: () => img.decode() }));
}

function shorten(text: string): string {
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
