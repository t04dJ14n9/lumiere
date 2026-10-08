import type { Infer } from "../kernel";
import type { featureSettings } from "./features";
import type { Disposer } from "../kernel";
import type { Endpoint, Transport } from "./rpc/endpoint";
export interface HostDocument {
  readonly id: string;
  readonly uri: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
  readonly eol: "\n" | "\r\n";
  getText(): string;
  save(): Promise<boolean>;
}
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}
export interface PanelPort {
  readonly id: string;
  readonly document: HostDocument;
  readonly rpc: Endpoint;
  active(): boolean;
  reveal(): void;
  dispose(): void;
}
export interface Workbench {
  fingerprint(text: string): string;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  onChange(listener: (document: HostDocument) => void): Disposer;
  onSave(listener: (document: HostDocument) => void): Disposer;
  onWillSave(listener: (document: HostDocument) => Promise<void>): Disposer;
  command(id: string, run: () => unknown): Disposer;
  execute(id: string, ...args: unknown[]): Promise<unknown>;
  clipboard: { read(): Promise<string>; write(text: string): Promise<void> };
  error(message: string): void;
}
declare module "../kernel/types" {
  interface Services {
    rpc: Endpoint;
    workbench: Workbench;
  }
}
export interface PanelShell {
  readonly id: string;
  readonly document: HostDocument;
  readonly transport: Transport;
  readonly cspSource: string;
  readonly trusted: boolean;
  active(): boolean;
  reveal(): void;
  dispose(): void;
  setHTML(html: string): void;
  asset(relative: string): string;
  onDispose(listener: () => void): Disposer;
  onState(listener: () => void): Disposer;
}
export interface Workbench {
  registerEditor(open: (panel: PanelShell) => void): Disposer;
  onConfiguration?(listener: () => void): Disposer;
  config(document: HostDocument): {
    features?: Infer<typeof featureSettings>;
    preset: "minimal" | "obsidian";
    mode: "source" | "livePreview";
  };
  root(document: HostDocument): string;
}
export interface FileInfo {
  uri: string;
  path: string;
  mtime: number;
  size: number;
  symbolicLink: boolean;
}
export interface Workbench {
  files(root: string): Promise<readonly FileInfo[]>;
  read(uri: string): Promise<Uint8Array>;
  stat(uri: string): Promise<{ mtime: number; symbolicLink: boolean }>;
}
export interface PanelShell {
  resource(uri: string): string;
}
