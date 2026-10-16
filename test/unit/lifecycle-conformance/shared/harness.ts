/** Only lifecycle semantics cross this boundary; no production runtime types. */
export type Release = () => void | Promise<void>;
export type ServiceName = "lifecycleBacking" | "lifecycleDerived";

export interface BackingService {
  readonly generation: number;
  read(): number;
}

export interface ActivationScope {
  /** PDF returns undefined because acquire has no early-release handle. */
  acquire(release: Release): Release | undefined;
  provide(name: ServiceName, value: BackingService): void;
  get(name: ServiceName): BackingService;
}

export interface PluginSpec {
  readonly id: string;
  readonly requires?: readonly string[];
  readonly provides?: ServiceName;
  activate(scope: ActivationScope): void | Promise<void>;
}

export type LifecycleState =
  "inactive" | "starting" | "active" | "stopping" | "failed" | "blocked";

export interface LifecycleHarness {
  readonly errors: readonly string[];
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  /** Markdown: Fiber.update; PDF: the public disable/enable sequence. */
  restart(id: string): Promise<void>;
  dispose(): Promise<void>;
  state(id: string): LifecycleState;
  service(name: ServiceName): BackingService | undefined;
}

export type HarnessFactory = (
  plugins: readonly PluginSpec[],
) => LifecycleHarness;

export interface DeferredGate {
  readonly opened: Promise<void>;
  open(): void;
}

export function deferredGate(): DeferredGate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}
