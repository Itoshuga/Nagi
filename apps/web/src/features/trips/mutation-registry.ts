import type { TripMutationQueue } from './mutation-queue';

/** Memory only, owned by the authenticated app layout. It lets writes finish
 * across internal navigation without persisting private notes on disk. */
export class TripQueueRegistry {
  private entries = new Map<
    string,
    {
      queue: TripMutationQueue;
      users: number;
      unsubscribe: () => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  get(key: string, create: () => TripMutationQueue) {
    const existing = this.entries.get(key);
    if (existing) return existing.queue;
    const queue = create(),
      entry = { queue, users: 0, unsubscribe: () => {} } as NonNullable<
        ReturnType<typeof this.entries.get>
      >;
    entry.unsubscribe = queue.subscribe(() => this.collect(key));
    this.entries.set(key, entry);
    return queue;
  }
  retain(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      entry.users++;
      entry.queue.start();
    }
  }
  release(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      entry.users = Math.max(0, entry.users - 1);
      this.collect(key);
    }
  }
  private collect(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.users || entry.queue.getSnapshot().pending) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      if (entry.users || entry.queue.getSnapshot().pending) return;
      entry.unsubscribe();
      entry.queue.dispose();
      this.entries.delete(key);
    }, 0);
  }
  pending() {
    return [...this.entries.values()].some((entry) => entry.queue.getSnapshot().pending > 0);
  }
  online(value: boolean) {
    for (const entry of this.entries.values()) entry.queue.setOnline(value);
  }
  dispose() {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
      entry.unsubscribe();
      entry.queue.dispose();
    }
    this.entries.clear();
  }
}
