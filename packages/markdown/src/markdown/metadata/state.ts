import { StateField } from "@codemirror/state";
import { metadata } from "./index";
import type { NoteMetadata } from "./types";
export const metadataField = StateField.define<NoteMetadata>({
  create: (state) => metadata(state.doc),
  update(value, transaction) {
    return transaction.docChanged ? metadata(transaction.newDoc) : value;
  },
});
export const headingIndex = StateField.define<NoteMetadata["headings"]>({
  create: (state) => state.field(metadataField).headings,
  update(_value, transaction) {
    return transaction.state.field(metadataField).headings;
  },
  provide: () => metadataField,
});
