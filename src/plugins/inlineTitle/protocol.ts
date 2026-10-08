import { Schema, defineProtocol, type Infer } from "../../kernel";
import { viewState } from "../editor/protocol";
export const focusTarget = Schema.union(["body", "properties"]);
export const titleValue = Schema.object({
  title: Schema.string().max(255),
  error: Schema.string().max(4096).optional(),
});
export const transfer = Schema.object({
  state: viewState,
  focus: focusTarget.optional(),
});
export const protocol = defineProtocol("inlineTitle", {
  requests: {
    rename: {
      params: Schema.object({
        title: Schema.string().max(255),
        focus: focusTarget.optional(),
      }),
      result: titleValue,
    },
    focus: {
      params: Schema.object({ target: focusTarget }),
      result: Schema.boolean(),
    },
  },
  notifications: {},
});

export type TitleFocus = Infer<typeof focusTarget>;
export type TitleValue = Infer<typeof titleValue>;
