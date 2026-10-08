import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Endpoint } from "../../shared/rpc/endpoint";
import type { HostDocument, SourceEdit } from "../../shared/runtime";
import type { Disposer } from "../../kernel";
export interface DocumentSession {
  readonly document: HostDocument;
  readonly text: string;
  readonly version: number;
  attach(id: string, rpc: Endpoint): Disposer;
  flush(): Promise<void>;
  changed(): void;
  save(): Promise<boolean>;
  withAction<T>(action: () => Promise<T>): Promise<T>;
  history(action: "undo" | "redo"): Promise<void>;
}
export interface Documents {
  session(document: HostDocument): DocumentSession;
  release(document: HostDocument): void;
}
export interface InputGrouping {
  extension: Extension;
  attach(view: EditorView): void;
  dispose(): void;
}
export interface ViewDocument {
  inputGroups?(
    vimMode?: (view: EditorView) => { insertMode?: boolean } | undefined,
  ): InputGrouping;
  beforeFlush?(commit: () => void): Disposer;
  readonly extension: Extension;
  attach(view: EditorView): Disposer;
  flush(): Promise<void>;
  pump(): void;
  readonly error: string | undefined;
}
declare module "../../kernel/types" {
  interface Services {
    documents: Documents;
    document: ViewDocument;
  }
  interface Events {
    /** @mode emit */ "document/syncStatus": (message: string) => void;
    /** @mode emit */ "document/changed": (
      session: DocumentSession,
      changes?: readonly SourceEdit[],
    ) => void;
    /** @mode serial */ "document/willSave": (
      session: DocumentSession,
    ) => void | Promise<void>;
  }
}

export { editGroup } from "./input-annotation";
