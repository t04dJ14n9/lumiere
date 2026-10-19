/**
 * One webview's navigation generation, retained across document reloads.
 * Capture current() before awaiting startup/layout. Advance for explicit
 * navigation, user input, a reload, or a new history replay. Check owns()
 * immediately before every delayed zoom/scroll mutation, including after
 * waiting for an earlier mutation to settle.
 */
export class NavigationIntent {
  private generation = 0;
  private reader = 0;

  current(): number {
    return this.generation;
  }

  /** Cancel older work and return the token for the new intent. */
  advance(): number {
    return ++this.generation;
  }

  /** Direct reading/navigation input also retires a passive search's origin. */
  interrupt(): number {
    this.reader++;
    return this.advance();
  }

  readerRevision(): number {
    return this.reader;
  }

  owns(token: number): boolean {
    return token === this.generation;
  }
}
