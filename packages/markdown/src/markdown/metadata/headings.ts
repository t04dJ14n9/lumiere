import type { Text } from "@codemirror/state";
import { metadata } from "./index";
export function headings(source: string | Text) {
  return metadata(source).headings;
}
