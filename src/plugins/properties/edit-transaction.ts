import { ChangeSet, type Text } from "@codemirror/state";
import {
  frontmatter,
  propertyChanges,
  type PropertyEdit,
} from "../../markdown/properties";

/** Persist display order together with the requested edit in one undo step. */
export function propertyTransaction(options: {
  document: Text;
  expected: string;
  operation: PropertyEdit;
  displayed: readonly string[];
}): ChangeSet | undefined {
  const { document, expected, operation, displayed } = options;
  const source = document.toString();
  const current = frontmatter(source)?.raw ?? "";
  if (current.replace(/\r?\n$/, "") !== expected.replace(/\r?\n$/, "")) {
    return undefined;
  }
  const changes = propertyChanges(source, operation);
  if (!changes) {
    return undefined;
  }
  const changeSet = ChangeSet.of(
    changes.filter(
      (change) => source.slice(change.from, change.to) !== change.insert,
    ),
    source.length,
  );
  const stored = Object.keys(frontmatter(source)?.values ?? {});
  if (
    operation.type === "order" ||
    displayed.length !== stored.length ||
    !displayed.some((key, index) => key !== stored[index])
  ) {
    return changeSet;
  }
  const next = changeSet.apply(document);
  const keys = orderedKeys(
    displayed,
    Object.keys(frontmatter(next.toString())?.values ?? {}),
    operation,
  );
  const reorder = propertyChanges(next.toString(), { type: "order", keys });
  if (!reorder) {
    return undefined;
  }
  return changeSet.compose(ChangeSet.of(reorder, next.length));
}

function orderedKeys(
  displayed: readonly string[],
  remainingKeys: readonly string[],
  operation: PropertyEdit,
): string[] {
  const remaining = new Set(remainingKeys);
  const order: string[] = [];
  for (const key of displayed) {
    const name =
      operation.type === "rename" && key === operation.key
        ? operation.name
        : key;
    if (remaining.delete(name)) {
      order.push(name);
    }
  }
  return [...order, ...remaining];
}
