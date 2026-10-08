import type { Commands } from "./api";

/** Command IDs are unique within one editor; registration lifetime belongs to callers. */
export function createCommands(): Commands {
  const handlers = new Map<string, () => boolean | Promise<boolean>>();
  return {
    register(id, run) {
      if (handlers.has(id)) {
        throw new Error(`Duplicate command ${id}`);
      }
      handlers.set(id, run);
      return () => {
        handlers.delete(id);
      };
    },
    async run(id) {
      return (await handlers.get(id)?.()) ?? false;
    },
  };
}
