const MAX_QUEUED_MESSAGES = 512;

/** Navigation waiting for the viewer belonging to the current byte load. */
export class HostInbox<T> {
  private currentGeneration = 0;
  private readonly queued: T[] = [];
  private subscription: { listener: (message: T) => void } | undefined;
  private draining = false;

  get generation(): number {
    return this.currentGeneration;
  }

  /** Retire the previous viewer and its navigation before opening new bytes. */
  beginLoad(): number {
    this.currentGeneration += 1;
    this.queued.length = 0;
    this.subscription = undefined;
    return this.currentGeneration;
  }

  /** Keep at most the latest 512 pending messages, in arrival order. */
  receive(message: T): void {
    if (this.queued.length >= MAX_QUEUED_MESSAGES) this.queued.shift();
    this.queued.push(message);
    this.drain();
  }

  /** Only a viewer created for the current load can receive its messages. */
  listen(listener: (message: T) => void, generation: number): () => void {
    if (generation !== this.currentGeneration) return () => undefined;
    const subscription = { listener };
    this.subscription = subscription;
    this.drain();
    return () => {
      if (this.subscription === subscription) this.subscription = undefined;
    };
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      // Read the active subscription each time: a callback may replace it,
      // detach it, or begin a load that discards the remaining old messages.
      while (this.subscription && this.queued.length > 0) {
        const message = this.queued.shift() as T;
        this.subscription.listener(message);
      }
    } finally {
      this.draining = false;
    }
  }
}
