/** `textEditor` sends a deck to VS Code's text editor, where Marp's own commands run. */
export function shouldOpenMarpAsText(input: {
  readonly mode: string;
  readonly isMarp: boolean;
  readonly allowed: boolean;
}): boolean {
  return input.mode === "textEditor" && input.isMarp && !input.allowed;
}

export function outsideDeckPath(folder: string, fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || "deck.md";
  return `${folder.replace(/\/+$/, "")}/${base}`;
}
