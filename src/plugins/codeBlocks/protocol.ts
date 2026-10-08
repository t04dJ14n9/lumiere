import { Schema, defineProtocol } from "../../kernel";
import { offset } from "../editor/protocol";
import type { ProcessorResult } from "./api";
export const language = Schema.string()
  .min(1)
  .max(64)
  .pattern(/^[\w+-]+$/);
const outputShape = Schema.object({
  markdown: Schema.string().max(1_000_000).optional(),
  html: Schema.string().max(1_000_000).optional(),
});
export const output = new Schema<ProcessorResult>((value) => {
  const parsed = outputShape.parse(value);
  if ((parsed.markdown === undefined) === (parsed.html === undefined)) {
    throw new Error("Supply Markdown or HTML, not both");
  }
  return parsed as ProcessorResult;
}, outputShape.toJSONSchema());
export const processors = Schema.object({
  epoch: offset,
  revision: offset,
  languages: Schema.array(language).max(256),
});
export const protocol = defineProtocol("codeBlocks", {
  requests: {
    current: { params: Schema.object({}), result: processors },
    render: {
      params: Schema.object({
        language,
        source: Schema.string().max(1_000_000),
        uri: Schema.string().max(32768),
        sourceLine: offset,
        revision: offset,
        epoch: offset,
      }),
      result: output,
    },
  },
  notifications: { changed: processors },
});
