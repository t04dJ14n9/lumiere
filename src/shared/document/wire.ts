import { ChangeSet, Text } from "@codemirror/state";
export interface WireUpdate {
  clientID: string;
  changes: unknown[];
}
export function textDocument(text: string): Text {
  return Text.of(text.split(/\r\n?|\n/));
}
export function difference(before: string, after: string): ChangeSet {
  let from = 0;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (from < oldEnd && from < newEnd && before[from] === after[from]) {
    from++;
  }
  while (
    oldEnd > from &&
    newEnd > from &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  return ChangeSet.of(
    { from, to: oldEnd, insert: after.slice(from, newEnd) },
    before.length,
  );
}
