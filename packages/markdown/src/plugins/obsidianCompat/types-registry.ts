import type { PropertyTypes, WirePropertyType } from "./api";
import {
  editTypesDocument,
  parseTypesDocument,
  validatePropertyType,
} from "./types-document";
import type { TypesDocument } from "./types-document";

export interface TypesRegistryIO {
  /** Only confirmed absence returns undefined; every other failure rejects. */
  read(): Promise<string | undefined>;
  /** Must replace expectedSource atomically, or reject without modifying it. */
  write(text: string, expectedSource: string | undefined): Promise<void>;
  warn(message: string, error: unknown): void;
  changed(): void;
}

export class TypesRegistryConflict extends Error {
  constructor() {
    super(
      "Obsidian types.json changed since it was read. Reload the property types and retry.",
    );
    this.name = "TypesRegistryConflict";
  }
}

/** One operation queue per vault, permanently bound to that vault's file I/O. */
export class TypesRegistry {
  private snapshot: TypesDocument | undefined;
  private queue = Promise.resolve();
  private hasWarned = false;
  private isStopped = false;

  constructor(private readonly io: TypesRegistryIO) {}

  get types(): PropertyTypes {
    return this.snapshot?.types ?? Object.freeze({});
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      if (this.isStopped) {
        return;
      }
      const next = await this.readSnapshot();
      if (next && !this.isStopped) {
        this.accept(next);
      }
    });
  }

  set(name: string, type: WirePropertyType | null): Promise<void> {
    validatePropertyType(name, type);
    return this.enqueue(async () => {
      this.assertLive();
      const base = this.snapshot ?? (await this.readSnapshot());
      if (!base) {
        throw new Error("Cannot edit unreadable Obsidian types.json.");
      }
      const current = await this.readSnapshot();
      if (!current) {
        throw new Error("Cannot edit unreadable Obsidian types.json.");
      }
      if (current.source !== base.source) {
        this.accept(current);
        throw new TypesRegistryConflict();
      }
      const text = editTypesDocument(current, name, type);
      this.assertLive();
      await this.io.write(text, current.source);
      if (!this.isStopped) {
        this.accept(parseTypesDocument(text));
      }
    });
  }

  async dispose(): Promise<void> {
    this.isStopped = true;
    await this.queue;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  private async readSnapshot(): Promise<TypesDocument | undefined> {
    try {
      return parseTypesDocument(await this.io.read());
    } catch (error) {
      if (!this.hasWarned) {
        this.hasWarned = true;
        this.io.warn(
          "Could not read Obsidian types.json; keeping the last good registry.",
          error,
        );
      }
      return undefined;
    }
  }

  private accept(next: TypesDocument): void {
    const previous = this.snapshot;
    this.snapshot = next;
    if (previous?.source !== next.source) {
      this.io.changed();
    }
  }

  private assertLive(): void {
    if (this.isStopped) {
      throw new Error("Obsidian property registry has stopped.");
    }
  }
}
