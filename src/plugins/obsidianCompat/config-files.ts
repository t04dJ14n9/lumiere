import type { Workbench } from "../../shared/runtime";
import { joinContained } from "../../shared/workspace-path";
import { TypesRegistryConflict } from "./types-registry";

export type ConfigFile = "types.json" | "app.json";
export interface ConfigFiles {
  read(file: ConfigFile): Promise<string | undefined>;
  writeTypes(text: string, expectedSource: string | undefined): Promise<void>;
  watch(file: ConfigFile, changed: () => void): () => void | Promise<void>;
}

/** Strict reads distinguish missing files from permission, decoding and I/O failures. */
export class ContainedConfigFiles implements ConfigFiles {
  constructor(
    private readonly workbench: Workbench,
    private readonly vaultRoot: string,
    private readonly directory: string,
  ) {}

  async read(file: ConfigFile): Promise<string | undefined> {
    const uri = this.target(file);
    await this.authorize(uri);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        await this.workbench.read(uri),
      );
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async writeTypes(
    text: string,
    expectedSource: string | undefined,
  ): Promise<void> {
    const files = this.workbench.files;
    const uri = this.target("types.json");
    await this.authorize(uri);
    if (!files) {
      throw new Error("Obsidian configuration writes are unavailable.");
    }
    await files.mkdir(this.directory);
    // Re-check after folder creation and containment I/O, as close to writing as
    // the host file API permits. It does not provide an atomic compare-and-swap.
    if ((await this.read("types.json")) !== expectedSource) {
      throw new TypesRegistryConflict();
    }
    await files.writeText(uri, text);
  }

  watch(file: ConfigFile, changed: () => void) {
    return this.workbench.watchFile?.(this.target(file), changed) ?? (() => {});
  }

  private target(file: ConfigFile): string {
    const uri = joinContained(this.directory, file);
    if (!uri) {
      throw new Error("Invalid Obsidian configuration path.");
    }
    return uri;
  }

  private async authorize(uri: string): Promise<void> {
    const check = this.workbench.files?.authorize;
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
