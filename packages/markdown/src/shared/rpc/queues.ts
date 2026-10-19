/**
 * Applies received state one piece at a time, in arrival order: each piece
 * of work starts after the one before it has settled (asynchronous work
 * included), and at once (synchronously up to its first await) when nothing
 * is applying, so an idle endpoint adds no delay.
 */
export class ApplyQueue {
  private tail: Promise<void> = Promise.resolve();
  private count = 0;
  /** Settles once everything queued so far has applied; never rejects. */
  get barrier(): Promise<void> | undefined {
    return this.count > 0 ? this.tail : undefined;
  }
  run(work: () => Promise<void>): Promise<void> {
    const run = async () => {
      try {
        await work();
      } finally {
        this.count--;
      }
    };
    const applied = this.count++ === 0 ? run() : this.tail.then(run);
    this.tail = applied.catch(() => {});
    return applied;
  }
}

/**
 * Unsent coalesced messages: a message replaces an unsent one with the same
 * channel and method, keeping the first one's place. `due` runs once, a
 * microtask after the first message since the last `take()`.
 */
export class CoalescingQueue<M extends { channel: string; method: string }> {
  private queued: M[] = [];
  private scheduled = false;
  constructor(private readonly due: () => void) {}
  add(message: M): void {
    const index = this.queued.findIndex(
      (item) =>
        item.channel === message.channel && item.method === message.method,
    );
    if (index === -1) {
      this.queued.push(message);
    } else {
      this.queued[index] = message;
    }
    if (!this.scheduled) {
      this.scheduled = true;
      void Promise.resolve().then(() => {
        this.scheduled = false;
        this.due();
      });
    }
  }
  /** Everything unsent, in order; the queue is empty afterwards. */
  take(): M[] {
    const messages = this.queued;
    this.queued = [];
    return messages;
  }
}
