/**
 * The owner's answers about running a vault's own code (Obsidian community
 * plugins), one per vault, kept in a JSON file; and the questions waiting
 * for the window to ask. Lumière's plugins ask through `VaultCodeTrust`
 * (host-node's StartOptions.vaultCode); the shell shows each question and
 * posts the answer back (api.ts).
 */
import type { VaultCodeTrust } from "@workshop/host-node";

/** A vault waiting for the owner's answer, and the plugins it would run. */
export interface TrustQuestion {
  readonly vault: string;
  readonly plugins: readonly string[];
}

interface Waiting {
  readonly plugins: Set<string>;
  readonly answered: ((allowed: boolean) => void)[];
}

/** Where the answers are kept: a JSON file on Node, the host's store in a browser. */
export interface TextFile {
  /** Undefined when there is none yet. */
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
}

export class VaultTrust implements VaultCodeTrust {
  private answers = new Map<string, boolean>();
  private readonly waiting = new Map<string, Waiting>();
  private readonly changeListeners = new Set<() => void>();
  private readonly questionListeners = new Set<() => void>();
  private writing: Promise<void> = Promise.resolve();

  /**
   * `file`: where the answers are kept. `toPath`: a vault's folder, by which
   * the window names it, from the root URI the plugins name it by.
   */
  constructor(
    private readonly file: TextFile,
    private readonly toPath: (uri: string) => string,
  ) {}

  async load(): Promise<void> {
    try {
      this.answers = readAnswers(JSON.parse((await this.file.read()) ?? ""));
    } catch {
      this.answers = new Map();
    }
  }

  answer(vaultRoot: string): boolean | undefined {
    return this.answers.get(this.folderOf(vaultRoot));
  }

  request(vaultRoot: string, plugins: readonly string[]): Promise<boolean> {
    const vault = this.folderOf(vaultRoot);
    if (this.answers.get(vault) === true) {
      return Promise.resolve(true);
    }
    // Every note open in the vault asks; the owner is asked once.
    const waiting = this.waiting.get(vault) ?? {
      plugins: new Set<string>(),
      answered: [],
    };
    this.waiting.set(vault, waiting);
    for (const plugin of plugins) {
      waiting.plugins.add(plugin);
    }
    const answered = new Promise<boolean>((resolve) => {
      waiting.answered.push(resolve);
    });
    notify(this.questionListeners);
    return answered;
  }

  onDidChange(listener: () => void): () => void {
    return listen(this.changeListeners, listener);
  }

  /** The vaults waiting for an answer. */
  questions(): readonly TrustQuestion[] {
    return [...this.waiting].map(([vault, waiting]) => ({
      vault,
      plugins: [...waiting.plugins],
    }));
  }

  onQuestionsChange(listener: () => void): () => void {
    return listen(this.questionListeners, listener);
  }

  /**
   * The owner's answer to a waiting question; kept, then every note in the
   * vault loads or drops its plugins. Only a vault that asked can be
   * answered, so nothing else can grant trust behind the owner's back.
   */
  async decide(vault: string, allowed: boolean): Promise<void> {
    const waiting = this.waiting.get(vault);
    if (!waiting) {
      throw new Error("No question is waiting for that vault");
    }
    this.answers.set(vault, allowed);
    this.waiting.delete(vault);
    await this.save();
    for (const resolve of waiting.answered) {
      resolve(allowed);
    }
    notify(this.questionListeners);
    notify(this.changeListeners);
  }

  private folderOf(vaultRoot: string): string {
    return vaultRoot.startsWith("file:") ? this.toPath(vaultRoot) : vaultRoot;
  }

  private save(): Promise<void> {
    const text =
      JSON.stringify({ vaults: Object.fromEntries(this.answers) }, null, 2) +
      "\n";
    // One write at a time, each of the latest answers.
    this.writing = this.writing
      .then(() => this.file.write(text))
      .catch(() => {});
    return this.writing;
  }
}

/** `{"vaults": {"/path": true}}`; anything else in the file is ignored. */
export function readAnswers(value: unknown): Map<string, boolean> {
  const vaults = (value as { vaults?: unknown } | null)?.vaults;
  const answers = new Map<string, boolean>();
  if (typeof vaults !== "object" || vaults === null) {
    return answers;
  }
  for (const [vault, allowed] of Object.entries(vaults)) {
    if (typeof allowed === "boolean") {
      answers.set(vault, allowed);
    }
  }
  return answers;
}

function listen(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(listeners: ReadonlySet<() => void>): void {
  for (const listener of listeners) {
    listener();
  }
}
