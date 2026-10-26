/**
 * The window's side of the service worker's questions (shared/messages.ts).
 * The worker asks every window of the app, since it cannot tell which one a
 * note's page belongs to; this one answers what it has (its notes' pages,
 * and the files they show), on the port that came with the question, and
 * "unknown" to the rest.
 */
import { parseQuestion, type Answer, type Question } from "./shared/messages";
import type { NotePages } from "./note-pages";
import { vaultFile, type VaultFilesParts } from "./vault-files";

/** Where the worker's messages arrive: `navigator.serviceWorker`. */
export interface WorkerMessages {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  startMessages(): void;
}

export interface AnswerOptions {
  readonly messages: WorkerMessages;
  /** The worker's script: another worker of this origin is not answered. */
  readonly worker: string;
  readonly answer: (question: Question) => Promise<Answer>;
}

/** Answer the worker's questions from now on. */
export function answerWorker({
  messages,
  worker,
  answer,
}: AnswerOptions): void {
  messages.addEventListener("message", (event) => {
    const port = event.ports[0];
    const question = parseQuestion(event.data);
    if (!port || !question || !isFrom(event.source, worker)) {
      return;
    }
    void answer(question)
      .catch((): Answer => ({ kind: "unknown" }))
      .then((reply) => port.postMessage(reply));
  });
  messages.startMessages();
}

/** What this window answers: the notes' pages it serves, and their files. */
export function windowAnswers(parts: {
  readonly pages: Pick<NotePages, "html">;
  readonly files: VaultFilesParts;
}): (question: Question) => Promise<Answer> {
  return async (question) => {
    if (question.lumiere === "file") {
      return vaultFile(parts.files, question);
    }
    const html = parts.pages.html(question.id);
    return html === undefined ? { kind: "unknown" } : { kind: "page", html };
  };
}

function isFrom(source: unknown, worker: string): boolean {
  return (
    typeof source === "object" &&
    source !== null &&
    "scriptURL" in source &&
    source.scriptURL === worker
  );
}
