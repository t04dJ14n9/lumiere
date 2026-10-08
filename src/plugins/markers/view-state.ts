import { ChangeSet, StateEffect, StateField } from "@codemirror/state";
import type { SourceMarker } from "./api";
import type { Infer } from "../../kernel";
import type { snapshot } from "./protocol";
import { mapMarker } from "./revisions";
export interface OwnedMarker {
  owner: string;
  marker: SourceMarker;
}
export const setMarkers = StateEffect.define<readonly OwnedMarker[]>();
export const markerState = StateField.define<readonly OwnedMarker[]>({
  create: () => [],
  update(value, transaction) {
    const supplied = transaction.effects.find((effect) =>
      effect.is(setMarkers),
    );
    if (supplied) {
      return supplied.value;
    }
    // A new value also repositions badges when source is revealed or a renderer changes.
    return value.flatMap((entry) => {
      const marker = mapMarker(entry.marker, transaction.changes);
      return marker ? [{ ...entry, marker }] : [];
    });
  },
});
export class WireMarkerHistory {
  private readonly changes = new Map<number, ChangeSet>();
  record(version: number, updates: readonly { changes: unknown[] }[]): void {
    updates.forEach((update, index) =>
      this.changes.set(version + index, ChangeSet.fromJSON(update.changes)),
    );
    while (this.changes.size > 512) {
      this.changes.delete(this.changes.keys().next().value!);
    }
  }
  map(
    value: Infer<typeof snapshot>,
    currentVersion: number,
    pending: readonly { changes: ChangeSet }[],
  ): OwnedMarker[] | undefined {
    if (value.version > currentVersion) {
      return undefined;
    }
    const changes: ChangeSet[] = [];
    for (let version = value.version; version < currentVersion; version++) {
      const change = this.changes.get(version);
      if (!change) {
        return undefined;
      }
      changes.push(change);
    }
    changes.push(...pending.map((update) => update.changes));
    return Object.entries(value.owners)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([owner, markers]) =>
        markers.flatMap((marker) => {
          let mapped: SourceMarker | undefined = marker;
          for (const change of changes) {
            if (mapped) {
              mapped = mapMarker(mapped, change);
            }
          }
          return mapped ? [{ owner, marker: mapped }] : [];
        }),
      );
  }
}
