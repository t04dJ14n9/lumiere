// The window answers the service worker's questions on the port that came
// with each, and only questions from its own worker.
import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  answerWorker,
  windowAnswers,
  type WorkerMessages,
} from "../../src/answers";
import type { Answer, Question } from "../../src/shared/messages";

const WORKER = "https://example.github.io/lumiere/sw.js";

/** `navigator.serviceWorker`, as far as the window uses it. */
function fakeContainer() {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  let started = false;
  const messages: WorkerMessages = {
    addEventListener: (_type, received) => {
      listener = received;
    },
    startMessages: () => {
      started = true;
    },
  };
  return {
    messages,
    started: () => started,
    /** Post `data` as `scriptURL`'s worker would; the answers on its port. */
    async ask(data: unknown, scriptURL = WORKER): Promise<unknown[]> {
      const channel = new MessageChannel();
      const answers: unknown[] = [];
      channel.port1.onmessage = (event) => answers.push(event.data);
      listener!({
        data,
        ports: [channel.port2],
        source: { scriptURL },
      } as unknown as MessageEvent<unknown>);
      await delay(20);
      channel.port1.close();
      return answers;
    },
  };
}

function answering(answer: (question: Question) => Promise<Answer>) {
  const container = fakeContainer();
  answerWorker({ messages: container.messages, worker: WORKER, answer });
  return container;
}

test("a question from the window's worker is answered on its port", async () => {
  const asked: Question[] = [];
  const container = answering(async (question) => {
    asked.push(question);
    return { kind: "page", html: "<p>Note</p>" };
  });
  assert.equal(container.started(), true, "messages queued until now arrive");
  assert.deepEqual(await container.ask({ lumiere: "page", id: "p1" }), [
    { kind: "page", html: "<p>Note</p>" },
  ]);
  assert.deepEqual(asked, [{ lumiere: "page", id: "p1" }]);
});

test("another worker of the origin, or a question that does not parse, gets nothing", async () => {
  const container = answering(async () => ({ kind: "page", html: "x" }));
  assert.deepEqual(
    await container.ask(
      { lumiere: "page", id: "p1" },
      "https://example.github.io/other/sw.js",
    ),
    [],
  );
  assert.deepEqual(await container.ask({ lumiere: "page" }), []);
  assert.deepEqual(await container.ask({ lumiere: "page", id: "" }), []);
  assert.deepEqual(await container.ask("page p1"), []);
});

test("a question the window fails on is answered as not its own", async () => {
  const container = answering(async () => {
    throw new Error("broken");
  });
  assert.deepEqual(await container.ask({ lumiere: "page", id: "p1" }), [
    { kind: "unknown" },
  ]);
});

test("the window answers with the pages it serves, and unknown for the rest", async () => {
  const answer = windowAnswers({
    pages: { html: (id) => (id === "p1" ? "<p>Note</p>" : undefined) },
  });
  assert.deepEqual(await answer({ lumiere: "page", id: "p1" }), {
    kind: "page",
    html: "<p>Note</p>",
  });
  assert.deepEqual(await answer({ lumiere: "page", id: "p2" }), {
    kind: "unknown",
  });
});
