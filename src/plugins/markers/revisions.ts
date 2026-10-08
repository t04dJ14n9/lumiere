import type { SourceEdit } from "../../shared/runtime";
import { ChangeSet, Text, type ChangeDesc } from "@codemirror/state";
import { RpcError } from "../../shared/rpc/lifecycle";
import type { SourceMarker } from "./api";
export function mapMarker(
  marker: SourceMarker,
  changes: ChangeDesc,
): SourceMarker | undefined {
  if (marker.from > marker.to || marker.to > changes.length) {
    return undefined;
  }
  const from = changes.mapPos(marker.from, 1);
  if (marker.from === marker.to) {
    return { ...marker, from, to: from };
  }
  const to = changes.mapPos(marker.to, -1);
  if (to < from || (marker.to > marker.from && to === from)) {
    return undefined;
  }
  return { ...marker, from, to };
}
interface Revision {
  from: number;
  to: number;
  changes: ChangeSet;
}
/** A bounded source-coordinate history; an unknown old version is rejected, never guessed. */
export class MarkerRevisions {
  private readonly revisions: Revision[] = [];
  constructor(
    private version: number,
    private text: string,
  ) {}
  update(
    version: number,
    text: string,
    edits?: readonly SourceEdit[],
  ): ChangeSet {
    const changes = edits
      ? ChangeSet.of(
          edits.map((edit) => ({
            ...edit,
            insert: Text.of(edit.insert.split("\n")),
          })),
          this.text.length,
        )
      : rawDifference(this.text, text);
    if (version !== this.version) {
      this.revisions.push({ from: this.version, to: version, changes });
      if (this.revisions.length > 128) {
        this.revisions.shift();
      }
    }
    this.version = version;
    this.text = text;
    return changes;
  }
  map(marker: SourceMarker): SourceMarker | undefined {
    let current: SourceMarker | undefined = marker;
    for (const revision of this.revisions) {
      if (current?.documentVersion === revision.from) {
        if (current.from > current.to || current.to > revision.changes.length) {
          throw new RpcError(
            "InvalidArgument",
            "Marker range is outside its source version",
          );
        }
        current = mapMarker(current, revision.changes);
        if (current) {
          current.documentVersion = revision.to;
        }
      }
    }
    if (!current) {
      return undefined;
    }
    if (current.documentVersion !== this.version) {
      throw new RpcError(
        "StaleSelection",
        "Marker source version is no longer available",
      );
    }
    if (current.from > current.to || current.to > this.text.length) {
      throw new RpcError(
        "InvalidArgument",
        "Marker range is outside the source",
      );
    }
    return { ...current };
  }
}
/** Preserve CR characters: public marker offsets address the original source, not the wire. */
function rawDifference(before: string, after: string): ChangeSet {
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
    {
      from,
      to: oldEnd,
      insert: Text.of(after.slice(from, newEnd).split("\n")),
    },
    before.length,
  );
}
