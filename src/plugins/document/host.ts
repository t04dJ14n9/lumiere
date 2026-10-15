import type { Plugin } from "../../kernel";
import type { HostDocument } from "../../shared/runtime";
import { Session } from "./session";
import type { Documents } from "./api";
export const documentHost: Plugin = {
  name: "document",
  inject: { required: ["workshop"] },
  apply(ctx) {
    const sessions = new Map<
      HostDocument,
      { session: Session; references: number }
    >();
    const documents: Documents = {
      session(document) {
        let entry = sessions.get(document);
        if (!entry) {
          entry = {
            session: new Session(document, ctx.workshop),
            references: 0,
          };
          sessions.set(document, entry);
        }
        entry.references++;
        return entry.session;
      },
      release(document) {
        const entry = sessions.get(document);
        if (entry && --entry.references <= 0) {
          sessions.delete(document);
        }
      },
    };
    ctx.provide("documents", documents);
    ctx.on("document/willSave", (session) => session.flush());
    ctx.effect(() =>
      ctx.workshop.onChange((document, changes) => {
        const session = sessions.get(document)?.session;
        if (session) {
          session.changed();
          ctx.emit("document/changed", session, changes);
        }
      }),
    );
    ctx.effect(() =>
      ctx.workshop.onWillSave(async (document) => {
        const session = sessions.get(document)?.session;
        if (session) {
          await ctx.serial("document/willSave", session);
          await session.flush();
        }
      }),
    );
    ctx.effect(() => () => sessions.clear());
  },
};
