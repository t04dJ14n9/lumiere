import type { Workshop } from "../../shared/runtime";
import { joinContained } from "../../shared/workspace-path";

export type ConfigFile = "types.json" | "app.json";
export interface ConfigFiles {
  read(file: ConfigFile): Promise<string | undefined>;
  /** Atomically replace the expected source, or reject without writing. */
  writeTypes(text: string, expectedSource: string | undefined): Promise<void>;
  watch(file: ConfigFile, changed: () => void): () => void | Promise<void>;
}

/** Strict reads distinguish missing files from permission, decoding and I/O failures. */
export class ContainedConfigFiles implements ConfigFiles {
  constructor(
    private readonly workshop: Workshop,
    private readonly vaultRoot: string,
    private readonly directory: string,
  ) {}

  async read(file: ConfigFile): Promise<string | undefined> {
    const uri = this.target(file);
    await this.authorize(uri);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        await this.workshop.read(uri),
      );
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async writeTypes(
    _text: string,
    _expectedSource: string | undefined,
  ): Promise<void> {
    // Neither writeText nor move can condition replacement on the observed base.
    // Re-reading before either still races external writers, so fail closed
    // before any filesystem mutation, including creating a missing directory.
    throw new Error(
      "Obsidian property types are read-only: the host file API does not support atomic conditional writes.",
    );
  }

  watch(file: ConfigFile, changed: () => void) {
    return this.workshop.watchFile?.(this.target(file), changed) ?? (() => {});
  }

  private target(file: ConfigFile): string {
    const uri = joinContained(this.directory, file);
    if (!uri) {
      throw new Error("Invalid Obsidian configuration path.");
    }
    return uri;
  }

  private async authorize(uri: string): Promise<void> {
    const check = this.workshop.files?.authorize;
    if (!check) {
      throw new Error("Contained configuration file access is unavailable.");
    }
    await check(this.vaultRoot, uri);
  }
}

function isMissingFile(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return error.code === "FileNotFound" || error.code === "ENOENT";
}
