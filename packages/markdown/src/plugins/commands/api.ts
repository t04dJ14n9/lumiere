import type { Disposer } from "@workshop/core";
export interface Commands {
  register(id: string, run: () => boolean | Promise<boolean>): Disposer;
  run(id: string): Promise<boolean>;
}
declare module "@workshop/core" {
  interface Services {
    commands: Commands;
  }
}
