/**
 * The worker's side of its questions to the app's windows (shared/messages.ts).
 * A question goes to every window of the app, each with a port of its own,
 * since the worker cannot tell which window a note's page belongs to; the
 * first window that has what was asked for answers it.
 */
import { parseAnswer, type Answer, type Question } from "../shared/messages";

/** How long a window may take to answer: one still starting may never. */
const ANSWER_TIMEOUT_MS = 10_000;

/** A window the worker can ask, as `Clients.matchAll` gives it. */
export interface AppWindow {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/** The first answer that is not "unknown"; undefined when no window has it. */
export function askWindows(
  windows: readonly AppWindow[],
  question: Question,
  timeoutMs = ANSWER_TIMEOUT_MS,
): Promise<Answer | undefined> {
  return new Promise((resolve) => {
    let waiting = windows.length;
    if (waiting === 0) {
      resolve(undefined);
    }
    for (const window of windows) {
      void askWindow(window, question, timeoutMs).then((answer) => {
        waiting--;
        if (answer && answer.kind !== "unknown") {
          resolve(answer);
        } else if (waiting === 0) {
          resolve(undefined);
        }
      });
    }
  });
}

/** One window's answer; undefined if it gives none, or none that parses, in time. */
function askWindow(
  window: AppWindow,
  question: Question,
  timeoutMs: number,
): Promise<Answer | undefined> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const done = (answer: Answer | undefined) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(answer);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    channel.port1.onmessage = (event) => done(parseAnswer(event.data));
    try {
      window.postMessage(question, [channel.port2]);
    } catch {
      done(undefined);
    }
  });
}
