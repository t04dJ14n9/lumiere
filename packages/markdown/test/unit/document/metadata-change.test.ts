import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet } from "@codemirror/state";
import { Session } from "../../../src/plugins/document/session";
import { protocol } from "../../../src/plugins/document/protocol";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";
import { rpcPair } from "../../support/rpc-pair";

// Cursor sometimes reports a change event with no content (a dirty-state
// change) before the edit lands. That event must not make the panel's own
// edit look like someone else's, or the panel rebases and sends it again.
test("a change event without content keeps a panel's pending edit its own", async () => {
  let text = "Original line";
  const owner: { session?: Session } = {};
  const document = fakeDocument({ getText: () => text });
  const host = fakeHost({
    hostDocuments: {
      apply: async (_doc, edits) => {
        owner.session!.changed();
        for (const edit of edits) {
          text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
        }
        owner.session!.changed();
        return true;
      },
    },
  });
  const session = new Session(document, host);
  owner.session = session;
  const pair = rpcPair();
  const received: string[] = [];
  pair.client.on(protocol, "updates", (message) => {
    for (const update of message.updates) {
      received.push(update.clientID);
    }
  });
  await session.attach("panel", pair.host);
  const insert = ChangeSet.of({ from: 13, insert: " saved" }, 13);
  await pair.client.call(protocol, "push", {
    version: 0,
    changes: [insert.toJSON() as unknown[]],
  });
  assert.equal(text, "Original line saved");
  assert.deepEqual(received, ["panel"]);
  await pair.dispose();
});
