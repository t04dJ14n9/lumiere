/**
 * Asks whether a vault's community plugins may run, as Obsidian does the
 * first time a vault turns them on. Plugins are code that came with the
 * vault, so keeping them off is the default button.
 */
import { useEffect, useRef } from "react";
import type { TrustQuestion } from "../api";
import { vaultName } from "../trust";

export interface TrustDialogProps {
  readonly question: TrustQuestion | undefined;
  readonly onAnswer: (allowed: boolean) => void;
}

export function TrustDialog({ question, onAnswer }: TrustDialogProps) {
  const keepOff = useRef<HTMLButtonElement>(null);
  useEffect(() => keepOff.current?.focus(), [question?.vault]);
  if (!question) {
    return null;
  }
  const name = vaultName(question.vault);
  return (
    <div className="trust-backdrop">
      <div
        className="trust-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="trust-title"
        aria-describedby="trust-body"
      >
        <h2 id="trust-title">Turn on the plugins in “{name}”?</h2>
        <div id="trust-body">
          <p>{pluginsLine(question.plugins)}</p>
          <p>
            Plugins are code that came with this vault. They can read and change
            its files. Turn them on only if you trust whoever made the vault.
          </p>
        </div>
        <div className="trust-buttons">
          <button
            ref={keepOff}
            type="button"
            className="secondary"
            onClick={() => onAnswer(false)}
          >
            Keep Them Off
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onAnswer(true)}
          >
            Trust and Turn On
          </button>
        </div>
      </div>
    </div>
  );
}

function pluginsLine(plugins: readonly string[]): string {
  if (plugins.length === 0) {
    return "Community plugins run here only if you trust this vault.";
  }
  const noun = plugins.length === 1 ? "plugin" : "plugins";
  return `This vault turns on ${plugins.length} community ${noun}: ${plugins.join(", ")}.`;
}
