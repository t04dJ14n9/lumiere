/**
 * Vaults asking to run their community plugins (src/server/vault-trust.ts):
 * the shell asks the owner about one at a time and posts the answer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ServerEvent, TrustQuestion } from "./api";
import { backend } from "./backend";

export interface TrustQuestions {
  /** The vault to ask about now, if any is waiting. */
  readonly question: TrustQuestion | undefined;
  answer(allowed: boolean): void;
  onServerEvent(event: ServerEvent): void;
}

export function useTrustQuestions(
  report: (work: Promise<unknown>) => void,
): TrustQuestions {
  const [questions, setQuestions] = useState<readonly TrustQuestion[]>([]);
  const reload = useCallback(
    () => report(backend().trust.questions().then(setQuestions)),
    [report],
  );
  // Questions asked before the window listened wait on the server.
  useEffect(reload, [reload]);
  const question = questions[0];
  const answer = useCallback(
    (allowed: boolean) => {
      if (question) {
        report(backend().trust.decide(question.vault, allowed).finally(reload));
      }
    },
    [question, report, reload],
  );
  const onServerEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "trust") {
        reload();
      }
    },
    [reload],
  );
  return useMemo(
    () => ({ question, answer, onServerEvent }),
    [question, answer, onServerEvent],
  );
}

/** The folder's name, for the question. */
export function vaultName(vault: string): string {
  return vault.split(/[\\/]/).filter(Boolean).pop() ?? vault;
}
