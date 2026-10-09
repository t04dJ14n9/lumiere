/**
 * Everything one loaded PDF holds in the viewer, owned in one place so it can
 * be let go in one place: the bytes, the PDFium engines started for them, and
 * the blob URL the worker engine loads its WASM from.
 *
 * Invariants:
 *
 * - `dispose()` releases everything the session created, and anything it is
 *   still creating: an engine that finishes starting after `dispose()` is
 *   destroyed as soon as it arrives, never handed out. (EmbedPDF's
 *   `usePdfiumEngine` hook leaks exactly that engine when it unmounts first,
 *   which is why the session, not the hook, starts engines.)
 * - At most one engine per mode. Giving up on the worker (`release('worker')`)
 *   destroys its engine before the main-thread one is used.
 * - The viewer disposes the previous session every time the host sends new
 *   bytes, after the new viewer has replaced the old one on screen.
 */
export type EngineMode = 'worker' | 'main-thread';

/** What the session needs from the outside world; tests pass fakes. */
export interface RenderSessionEnvironment<Engine> {
  /** Start a PDFium engine in `mode`, loading its WASM from `wasmUrl`. */
  createEngine(mode: EngineMode, wasmUrl: string): Promise<Engine>;
  /** Close the engine's documents and stop it (and its worker). */
  destroyEngine(engine: Engine): void;
  /** Fetch the WASM so the worker can load it from a blob URL. */
  fetchWasm(url: string): Promise<Blob>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
}

export class RenderSessionDisposedError extends Error {
  constructor() {
    super('The PDF render session was disposed');
    this.name = 'RenderSessionDisposedError';
  }
}

export class PdfRenderSession<Engine> {
  private bytes: ArrayBuffer | undefined;
  private readonly engines = new Map<EngineMode, Promise<Engine>>();
  /** The current start of each mode; a start that is no longer current is abandoned. */
  private readonly attempts = new Map<EngineMode, symbol>();
  private readonly started = new Map<EngineMode, Engine>();
  private readonly objectUrls: string[] = [];
  private live = true;

  constructor(
    buffer: ArrayBuffer,
    private readonly wasmUrl: string,
    private readonly environment: RenderSessionEnvironment<Engine>,
  ) {
    this.bytes = buffer;
  }

  get disposed(): boolean {
    return !this.live;
  }

  /** The PDF's bytes; gone once the session is disposed. */
  get buffer(): ArrayBuffer {
    if (!this.bytes) throw new RenderSessionDisposedError();
    return this.bytes;
  }

  /** The engine for `mode`, started on first use. Rejects once disposed. */
  engine(mode: EngineMode): Promise<Engine> {
    if (!this.live) return Promise.reject(new RenderSessionDisposedError());
    let engine = this.engines.get(mode);
    if (!engine) {
      const attempt = Symbol(mode);
      this.attempts.set(mode, attempt);
      engine = this.start(mode, attempt);
      this.engines.set(mode, engine);
    }
    return engine;
  }

  /** Stop the engine of `mode` (the worker failed); another may be started. */
  release(mode: EngineMode): void {
    this.engines.delete(mode);
    this.attempts.delete(mode);
    const engine = this.started.get(mode);
    if (!engine) return;
    this.started.delete(mode);
    this.environment.destroyEngine(engine);
  }

  dispose(): void {
    if (!this.live) return;
    this.live = false;
    for (const mode of [...this.started.keys()]) this.release(mode);
    this.engines.clear();
    this.attempts.clear();
    for (const url of this.objectUrls.splice(0)) this.environment.revokeObjectUrl(url);
    this.bytes = undefined;
  }

  private async start(mode: EngineMode, attempt: symbol): Promise<Engine> {
    const current = (): boolean => this.live && this.attempts.get(mode) === attempt;
    const wasmUrl = mode === 'worker' ? await this.workerWasmUrl() : this.wasmUrl;
    if (!current()) throw new RenderSessionDisposedError();
    const engine = await this.environment.createEngine(mode, wasmUrl);
    // Disposed, or this mode released, while the engine was starting.
    if (!current()) {
      this.environment.destroyEngine(engine);
      throw new RenderSessionDisposedError();
    }
    this.started.set(mode, engine);
    return engine;
  }

  /** The worker cannot fetch the extension's resource URL itself. */
  private async workerWasmUrl(): Promise<string> {
    const blob = await this.environment.fetchWasm(this.wasmUrl);
    this.assertLive();
    const url = this.environment.createObjectUrl(blob);
    this.objectUrls.push(url);
    return url;
  }

  private assertLive(): void {
    if (!this.live) throw new RenderSessionDisposedError();
  }
}
