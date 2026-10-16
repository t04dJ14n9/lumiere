type NoteViewport = Pick<
  HTMLElement,
  "scrollTop" | "scrollHeight" | "clientHeight"
> & { scrollTo(options: ScrollToOptions): void };

/** One destination per editor panel, shared by its table widgets. */
export class TableWheelMotion {
  private target: number | undefined;
  private previousTop = 0;

  constructor(
    private readonly viewport: NoteViewport,
    private readonly prefersReducedMotion: () => boolean,
  ) {}

  scroll(distance: number): boolean {
    const current = this.viewport.scrollTop;
    const pending = this.clamp(this.target ?? current);
    const remaining = pending - current;
    // Reverse from the visible position rather than finishing the old gesture.
    const isReversing = remaining * distance < 0;
    const origin = isReversing ? current : pending;
    const top = this.clamp(origin + distance);
    if (top === origin) {
      // An outward reversal at the visible edge must cancel an inward gesture
      // even though this tick itself has no room and will chain natively.
      if (isReversing) {
        this.stop();
      }
      return false;
    }
    const behavior = this.prefersReducedMotion() ? "instant" : "smooth";
    this.previousTop = current;
    this.target = behavior === "smooth" ? top : undefined;
    // scrollBy would add to the animated position and lose unconsumed ticks.
    this.viewport.scrollTo({ top, behavior });
    return true;
  }

  observeScroll(): void {
    if (this.target === undefined) {
      return;
    }
    const current = this.viewport.scrollTop;
    const target = this.clamp(this.target);
    const remaining = target - this.previousTop;
    // Subpixel proximity is still progress, not completion. Rounded CSSOM
    // destinations are released by scrollend. A direction change or overshoot
    // means another scroll has taken over, so its old destination must be dropped.
    if (
      target === current ||
      (current - this.previousTop) * remaining < 0 ||
      (target - current) * remaining < 0
    ) {
      this.stop();
      return;
    }
    this.previousTop = current;
  }

  stop(): void {
    if (this.target === undefined) {
      return;
    }
    this.target = undefined;
    this.viewport.scrollTo({
      top: this.viewport.scrollTop,
      behavior: "instant",
    });
  }

  private clamp(top: number): number {
    return Math.max(
      0,
      Math.min(top, this.viewport.scrollHeight - this.viewport.clientHeight),
    );
  }
}
