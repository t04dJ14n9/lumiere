import type { Schema } from "../kernel";
export interface Manifest {
  readonly config?: Schema<unknown>;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "core" | "feature";
  readonly defaultEnabled: boolean;
  readonly surfaces: readonly ("host" | "webview")[];
  readonly contributes?: {
    keybindings?: readonly {
      id: string;
      key: string;
      mac?: string;
      scope?: "editor" | "workbench";
    }[];
    commands?: readonly {
      id: string;
      title: string;
      editorCommand?: string;
      key?: string;
      mac?: string;
      /**
       * Where the command applies. `editor` (the default) is the Markdown
       * Workbench editor; `workbench` is anywhere, for commands such as the
       * quick switcher.
       */
      scope?: "editor" | "workbench";
    }[];
    /** Native views in the Explorer; `editor` views show only beside this editor. */
    views?: readonly {
      id: string;
      name: string;
      scope?: "editor" | "workbench";
      /** A further when-clause, for example to show only beside this editor. */
      when?: string;
    }[];
  };
}
export function defineManifest<T extends Manifest>(manifest: T): T {
  return Object.freeze(manifest);
}
