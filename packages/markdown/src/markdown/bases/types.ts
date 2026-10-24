export interface BaseNoteEntry {
  path: string;
  basename: string;
  extension: string;
  mtime: number;
  size: number;
  frontmatter?: Record<string, unknown>;
  tags: string[];
  links: string[];
  embeds: string[];
  backlinks: string[];
}

export type BaseFilter =
  | { kind: "expr"; expr: string }
  | { kind: "and"; items: BaseFilter[] }
  | { kind: "or"; items: BaseFilter[] }
  | { kind: "not"; items: BaseFilter[] };

export interface BaseSortRule {
  property: string;
  direction: "ASC" | "DESC";
}

export type BaseViewType = "table" | "cards" | "list" | "map";

export interface BaseViewConfig {
  type: BaseViewType;
  name: string;
  filters?: BaseFilter;
  order: string[];
  sort: BaseSortRule[];
  groupBy?: BaseSortRule;
  limit?: number;
  summaries: Record<string, string>;
}

export interface BasePropertyConfig {
  displayName?: string;
}

export interface BaseDefinition {
  filters?: BaseFilter;
  formulas: Record<string, string>;
  properties: Record<string, BasePropertyConfig>;
  summaries: Record<string, string>;
  views: BaseViewConfig[];
}

export type BaseCellValue =
  | { kind: "null" }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "date"; value: string; ms: number; dateOnly?: boolean }
  | { kind: "duration"; ms: number }
  | { kind: "link"; target: string; label: string }
  | { kind: "tag"; value: string }
  | { kind: "list"; items: BaseCellValue[] };

export interface BaseColumn {
  id: string;
  displayName: string;
}

export interface BaseEvaluatedRow {
  entry: BaseNoteEntry;
  cells: Record<string, BaseCellValue>;
}

export interface BaseEvaluatedGroup {
  key?: BaseCellValue;
  rows: BaseEvaluatedRow[];
}

export interface BaseEvaluatedView {
  view: BaseViewConfig;
  columns: BaseColumn[];
  rows: BaseEvaluatedRow[];
  groups: BaseEvaluatedGroup[];
  summaries: Record<string, string>;
  totalMatches: number;
}
