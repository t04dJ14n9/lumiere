import type { Disposer } from "../kernel";
import type {
  Configuration,
  ConfigurationInspection,
  ConfigurationProvider,
} from "../shared/configuration";

export interface ConfigurationSource {
  get(key: string, resource?: string): unknown;
  inspect(key: string, resource: string): ConfigurationInspection | undefined;
  onDidChange(listener: () => void): Disposer;
}

/** Feature providers supply effective resource settings without persisting them. */
export class EffectiveConfiguration implements Configuration {
  private readonly providers = new Set<ConfigurationProvider>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly source: ConfigurationSource) {}

  get<T>(key: string, fallback: T, resource?: string): T {
    if (resource !== undefined) {
      for (const provider of this.providers) {
        const value = provider.get(key, resource);
        if (value !== undefined) {
          return value as T;
        }
      }
    }
    const value = this.source.get(key, resource);
    return value === undefined ? fallback : (value as T);
  }

  inspect(key: string, resource: string) {
    return this.source.inspect(key, resource);
  }

  register(provider: ConfigurationProvider): Disposer {
    this.providers.add(provider);
    this.invalidate();
    return () => {
      this.providers.delete(provider);
      this.invalidate();
    };
  }

  async prepare(resource: string): Promise<void> {
    await Promise.all(
      [...this.providers].map((provider) => provider.prepare(resource)),
    );
  }

  invalidate(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  onDidChange(listener: () => void): Disposer {
    this.listeners.add(listener);
    const stop = this.source.onDidChange(listener);
    return () => {
      this.listeners.delete(listener);
      return stop();
    };
  }
}
