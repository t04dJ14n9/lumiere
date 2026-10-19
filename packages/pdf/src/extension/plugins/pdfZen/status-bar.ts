/** `workbench.statusBar.visible` as the user's settings hold it: unset is undefined. */
export interface StatusBarSetting {
  get(): boolean | undefined;
  set(value: boolean | undefined): PromiseLike<void>;
}

/**
 * Gives the reader back their status bar after zen. Cursor (3.23) saves
 * `workbench.statusBar.visible: false` when Zen Mode hides the status bar,
 * then reads that setting on the way out and leaves the bar hidden for good.
 * VS Code keeps zen out of the settings, so there this never writes.
 */
export class StatusBarAfterZen {
  /** The reader's own value, from before zen began. */
  private before: { value: boolean | undefined } | undefined;

  constructor(private readonly setting: StatusBarSetting) {}

  /** Zen is about to begin. */
  entering(): void {
    this.before ??= { value: this.setting.get() };
  }

  /** Zen has ended: undo the setting zen wrote, if it wrote one. */
  async left(): Promise<void> {
    const before = this.before;
    this.before = undefined;
    if (before && before.value !== false && this.setting.get() === false) {
      await this.setting.set(before.value);
    }
  }
}
