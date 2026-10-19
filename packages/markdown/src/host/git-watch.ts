/** Structural slice of vscode.git events; usable in unit tests without VS Code. */
type GitEvent<T> = (listener: (value: T) => void) => { dispose(): unknown };
export interface WatchedRepository {
  readonly rootUri: { toString(): string };
  readonly state: { readonly onDidChange: GitEvent<void> };
}
export interface RepositorySource {
  readonly repositories: readonly WatchedRepository[];
  readonly onDidOpenRepository: GitEvent<WatchedRepository>;
  readonly onDidCloseRepository: GitEvent<WatchedRepository>;
}

/** One underlying subscription per repository, shared by every plugin/panel. */
export class RepositoryWatch {
  private readonly subscriptions: { dispose(): unknown }[] = [];
  private readonly repositories = new Map<
    WatchedRepository,
    { dispose(): unknown }
  >();
  private readonly discovered = new Map<string, { dispose(): unknown }>();
  private readonly sources = new Set<RepositorySource>();
  private readonly listeners = new Set<() => void>();
  private readonly generations = new Map<string, number>();

  repoGeneration(root: string): number {
    return this.generations.get(root) ?? 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  attach(source: RepositorySource): void {
    if (this.sources.has(source)) {
      return;
    }
    this.sources.add(source);
    source.repositories.forEach((repository) => this.watch(repository));
    this.subscriptions.push(
      source.onDidOpenRepository((repository) => {
        this.watch(repository);
        this.changed(repository);
      }),
      source.onDidCloseRepository((repository) => {
        this.repositories.get(repository)?.dispose();
        this.repositories.delete(repository);
        this.changed(repository);
      }),
    );
  }

  /**
   * Enroll a root discovered without vscode.git so generation counters and
   * `changed` fan-out share the same path as API repositories. Idempotent per
   * root; does not publish until `onDidChange` fires.
   */
  enrollDiscovered(root: string, onDidChange: GitEvent<void>): void {
    if (this.discovered.has(root)) {
      return;
    }
    if (!this.generations.has(root)) {
      this.generations.set(root, 0);
    }
    this.discovered.set(
      root,
      onDidChange(() => {
        this.advance(root);
        this.publish();
      }),
    );
  }

  /** Enablement changes invalidate all known roots before notifying anyone. */
  invalidate(): void {
    for (const root of this.generations.keys()) {
      this.advance(root);
    }
    this.publish();
  }

  private watch(repository: WatchedRepository): void {
    if (this.repositories.has(repository)) {
      return;
    }
    const root = repository.rootUri.toString();
    if (!this.generations.has(root)) {
      this.generations.set(root, 0);
    }
    this.repositories.set(
      repository,
      repository.state.onDidChange(() => this.changed(repository)),
    );
  }

  private changed(repository: WatchedRepository): void {
    // This boundary is shared: advancing in subscriber callbacks would multiply
    // generations and leave different panels holding incompatible epochs.
    this.advance(repository.rootUri.toString());
    this.publish();
  }

  private advance(root: string): void {
    this.generations.set(root, this.repoGeneration(root) + 1);
  }

  private publish(): void {
    for (const listener of this.listeners) {
      // One plugin's teardown/failing observer must not suppress other panels.
      try {
        listener();
      } catch {
        /* Observers own their reporting. */
      }
    }
  }

  detach(): void {
    this.subscriptions
      .splice(0)
      .forEach((subscription) => subscription.dispose());
    this.repositories.forEach((subscription) => subscription.dispose());
    this.repositories.clear();
    this.discovered.forEach((subscription) => subscription.dispose());
    this.discovered.clear();
    this.sources.clear();
  }
  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}
