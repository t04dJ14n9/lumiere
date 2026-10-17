export type Release = () => void | Promise<void>;

/** App resources use one Cordis effect, with an app-owned completion barrier. */
export class Lifetime {
  private readonly held: Release[] = [];
  private readonly releasing = new Set<Promise<void>>();
  private closing: Promise<void> | undefined;
  private live = true;
  private cancelApply!: () => void;
  readonly cancelled = new Promise<void>((resolve) => {
    this.cancelApply = resolve;
  });

  constructor(private readonly report: (error: unknown) => void) {}

  get isLive(): boolean {
    return this.live;
  }

  /** Refused acquisitions still run their inverse and stay represented. */
  acquire(inverse: Release): Release {
    let completion: Promise<void> | undefined;
    const release = (): Promise<void> => {
      if (completion) {
        return completion;
      }
      // Publish the join handle before invoking user code (including reentry).
      let finish!: () => void;
      completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const current = completion;
      this.releasing.add(current);
      const done = () => {
        this.releasing.delete(current);
        finish();
      };
      try {
        void Promise.resolve(inverse()).then(done, (error: unknown) => {
          this.report(error);
          done();
        });
      } catch (error) {
        this.report(error);
        done();
      }
      return current;
    };
    if (!this.live) {
      void release(); // Never rejects; tracked until its inverse settles.
      throw new Error("cannot acquire on a stopped lifetime");
    }
    this.held.push(release);
    return release;
  }

  cancel(): void {
    this.live = false;
    this.cancelApply();
  }

  /** Rollback and every stop caller join the same sequential LIFO unload. */
  dispose(): Promise<void> {
    this.live = false;
    this.closing ??= Promise.resolve().then(async () => {
      for (const release of this.held.splice(0).reverse()) {
        await release();
      }
      await this.drain();
    });
    // Also join acquisitions refused after the initial unload completed.
    return this.closing.then(() => this.drain());
  }

  private async drain(): Promise<void> {
    while (this.releasing.size) {
      await Promise.all([...this.releasing]);
    }
  }
}
