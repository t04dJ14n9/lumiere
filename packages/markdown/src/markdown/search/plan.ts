import type { SearchQuery } from "./query";
interface ContextNeeds {
  text: boolean;
  values: boolean;
}
/** Conservative plan: scope resets can expose content even inside an indexed predicate. */
export function queryRequirements(query: SearchQuery): {
  text: boolean;
  metadata: boolean;
} {
  return {
    text: needsText(query, { text: true, values: false }),
    metadata: needsMetadata(query),
  };
}
function needsText(query: SearchQuery, context: ContextNeeds): boolean {
  switch (query.kind) {
    case "text":
    case "regex":
      return context.text && !context.values;
    case "and":
    case "or":
      return query.terms.some((term) => needsText(term, context));
    case "not":
      return needsText(query.term, context);
    case "property": {
      const values = { ...context, values: true };
      return (
        needsText(query.name, values) ||
        !!(query.value && needsText(query.value, values))
      );
    }
    case "scope":
      return scopedText(query, context);
  }
}
function scopedText(
  query: Extract<SearchQuery, { kind: "scope" }>,
  context: ContextNeeds,
): boolean {
  if (query.scope === "file" || query.scope === "path") {
    return needsText(query.term, { text: false, values: false });
  }
  if (query.scope === "tag") {
    return needsText(query.term, { ...context, values: true });
  }
  if (query.scope === "match-case" || query.scope === "ignore-case") {
    return needsText(query.term, context);
  }
  if (query.scope === "content") {
    return needsText(query.term, { ...context, values: false });
  }
  // Line/region scopes read their current text even if their child only compares a file name.
  return context.text || needsText(query.term, { ...context, values: false });
}
function needsMetadata(query: SearchQuery): boolean {
  switch (query.kind) {
    case "property":
      return true;
    case "scope":
      return query.scope === "tag" || needsMetadata(query.term);
    case "and":
    case "or":
      return query.terms.some(needsMetadata);
    case "not":
      return needsMetadata(query.term);
    default:
      return false;
  }
}
