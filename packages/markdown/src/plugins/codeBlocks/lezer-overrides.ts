import type { Parser, TreeCursor } from "@lezer/common";
import Prism from "prism-languages";
import type { CodeTokenRange } from "./code-highlight";
import { normalizeLanguageName, resolveLezerId } from "./lezer-languages";

const GO_BUILTIN_FUNCS = new Set(
  "append cap clear close complex copy delete imag len make max min new panic print println real recover".split(
    " ",
  ),
);

const GO_BUILTIN_TYPES = new Set(
  "any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr".split(
    " ",
  ),
);

const GO_CONST_PARENTS = new Set(
  "ArgumentList Arguments BinaryExp BinaryExpr CaseClause Element ExprCaseClause ExpressionList IndexExpr KeyedElement ParenExpr ParenthesizedExpr ReturnStatement ReturnStmt SliceExpr SwitchStmt TypeSwitchStmt UnaryExp UnaryExpr Value".split(
    " ",
  ),
);

const PYTHON_BUILTINS = new Set(
  "abs all any bool bytes callable chr classmethod dict dir divmod enumerate Exception filter float frozenset getattr hasattr hash hex id int isinstance issubclass iter len list map max min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip".split(
    " ",
  ),
);

interface OverrideCollector {
  source: string;
  languageId: string;
  overrides: Map<string, CodeTokenRange>;
  removeSpans: { from: number; to: number }[];
  prismTokenize: (source: string, grammar: Prism.Grammar) => CodeTokenRange[];
}

export function collectAstOverrides(
  source: string,
  languageId: string,
  tree: ReturnType<Parser["parse"]>,
  prismTokenize: (source: string, grammar: Prism.Grammar) => CodeTokenRange[],
): {
  overrides: Map<string, CodeTokenRange>;
  removeSpans: { from: number; to: number }[];
} {
  const overrides = new Map<string, CodeTokenRange>();
  const removeSpans: { from: number; to: number }[] = [];
  if (
    languageId !== "go" &&
    languageId !== "python" &&
    languageId !== "yaml" &&
    languageId !== "markdown"
  ) {
    return { overrides, removeSpans };
  }
  const state: OverrideCollector = {
    source,
    languageId,
    overrides,
    removeSpans,
    prismTokenize,
  };
  const cursor = tree.cursor();
  do {
    visitOverrideNode(cursor, state);
  } while (cursor.next());
  return { overrides, removeSpans };
}

function visitOverrideNode(cursor: TreeCursor, state: OverrideCollector): void {
  if (state.languageId === "go" && cursor.name === "VariableName") {
    const classes = classifyGoVariable(cursor, state.source);
    if (classes) {
      state.overrides.set(`${cursor.from}:${cursor.to}`, {
        from: cursor.from,
        to: cursor.to,
        classes,
      });
    }
  } else if (state.languageId === "python" && cursor.name === "VariableName") {
    const classes = classifyPythonVariable(cursor, state.source);
    if (classes) {
      state.overrides.set(`${cursor.from}:${cursor.to}`, {
        from: cursor.from,
        to: cursor.to,
        classes,
      });
    }
  } else if (state.languageId === "yaml" && cursor.name === "Literal") {
    const classes = classifyYamlLiteral(cursor, state.source);
    if (classes) {
      state.overrides.set(`${cursor.from}:${cursor.to}`, {
        from: cursor.from,
        to: cursor.to,
        classes,
      });
    }
  } else if (state.languageId === "markdown" && cursor.name === "FencedCode") {
    applyMarkdownFallbackFence(cursor, state);
  }
}

function classifyGoVariable(
  cursor: TreeCursor,
  source: string,
): string | undefined {
  const text = source.slice(cursor.from, cursor.to);
  const parentName = cursor.node.parent?.name;
  if (parentName === "Key") {
    return "token property";
  }
  if (
    parentName === "SelectorExpr" &&
    cursor.node.parent?.parent?.name === "CallExpr"
  ) {
    return "token namespace";
  }
  if (GO_BUILTIN_FUNCS.has(text)) {
    return "token builtin";
  }
  if (GO_BUILTIN_TYPES.has(text)) {
    return "token type class-name";
  }
  if (text === "true" || text === "false") {
    return "token boolean";
  }
  if (
    text === "nil" ||
    text === "iota" ||
    isGoConstantIdent(text, parentName)
  ) {
    return "token constant";
  }
  return undefined;
}

function isGoConstantIdent(
  text: string,
  parentName: string | undefined,
): boolean {
  if (!parentName || !GO_CONST_PARENTS.has(parentName)) {
    return false;
  }
  return (
    /^[A-Z][A-Z0-9_]+$/.test(text) ||
    /^[A-Z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(text)
  );
}

function classifyPythonVariable(
  cursor: TreeCursor,
  source: string,
): string | undefined {
  const text = source.slice(cursor.from, cursor.to);
  if (!PYTHON_BUILTINS.has(text)) {
    return undefined;
  }
  const parentName = cursor.node.parent?.name;
  return parentName === "TypeDef" || parentName === "ParamList"
    ? "token type class-name"
    : "token builtin";
}

function classifyYamlLiteral(
  cursor: TreeCursor,
  source: string,
): string | undefined {
  if (cursor.node.parent?.name === "Key") {
    return undefined;
  }
  const text = source.slice(cursor.from, cursor.to).trim();
  if (/^(?:true|false|yes|no|on|off)$/i.test(text)) {
    return "token boolean";
  }
  if (/^(?:null|~)$/i.test(text)) {
    return "token constant";
  }
  if (
    /^[+-]?(?:0x[0-9a-fA-F]+|0o[0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(
      text,
    )
  ) {
    return "token number";
  }
  return "token string";
}

function applyMarkdownFallbackFence(
  cursor: TreeCursor,
  state: OverrideCollector,
): void {
  const infoNode = cursor.node.getChild("CodeInfo");
  const textNode = cursor.node.getChild("CodeText");
  if (!infoNode || !textNode) {
    return;
  }
  const rawLang = state.source
    .slice(infoNode.from, infoNode.to)
    .trim()
    .split(/\s+/)[0];
  if (!rawLang || resolveLezerId(rawLang)) {
    return;
  }
  const normalized = normalizeLanguageName(rawLang);
  const grammar = Prism.languages[rawLang] ?? Prism.languages[normalized];
  if (!grammar) {
    return;
  }
  state.removeSpans.push({ from: textNode.from, to: textNode.to });
  const innerSource = state.source.slice(textNode.from, textNode.to);
  for (const range of state.prismTokenize(innerSource, grammar)) {
    const from = textNode.from + range.from;
    const to = textNode.from + range.to;
    state.overrides.set(`${from}:${to}`, { from, to, classes: range.classes });
  }
}
