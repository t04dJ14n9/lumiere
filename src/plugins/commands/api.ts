import type { Disposer } from "../../kernel";
export interface Commands {
  register(id: string, run: () => boolean | Promise<boolean>): Disposer;
  run(id: string): Promise<boolean>;
}
declare module "../../kernel/types" {
  interface Services {
    commands: Commands;
  }
}
