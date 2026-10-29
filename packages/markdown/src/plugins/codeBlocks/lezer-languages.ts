import type { Parser } from "@lezer/common";
import { styleTags, tagHighlighter, tags as t } from "@lezer/highlight";

export interface LezerLanguageSpec {
  id: string;
  parser: Parser;
}

const ALIAS_GROUPS: readonly [string, readonly string[]][] = [
  ["go", ["go", "golang"]],
  ["javascript", ["js", "javascript", "mjs", "cjs"]],
  ["typescript", ["ts", "typescript", "mts", "cts"]],
  ["jsx", ["jsx"]],
  ["tsx", ["tsx"]],
  ["python", ["py", "python"]],
  ["rust", ["rs", "rust"]],
  ["c", ["c", "h"]],
  ["cpp", ["cpp", "c++", "cc", "cxx", "hpp", "hh"]],
  ["java", ["java"]],
  ["json", ["json", "jsonc", "json5"]],
  ["html", ["html", "htm"]],
  ["xml", ["xml", "svg", "xhtml"]],
  ["css", ["css"]],
  ["scss", ["scss"]],
  ["sass", ["sass"]],
  ["sql", ["sql"]],
  ["postgresql", ["postgres", "postgresql"]],
  ["mysql", ["mysql"]],
  ["sqlite", ["sqlite"]],
  ["yaml", ["yaml", "yml"]],
  ["markdown", ["md", "markdown"]],
  ["php", ["php"]],
];

export const LEZER_ALIASES: ReadonlyMap<string, string> = new Map(
  ALIAS_GROUPS.flatMap(([id, aliases]) => aliases.map((alias) => [alias, id])),
);

export const loadedLezer = new Map<string, LezerLanguageSpec>();

export function normalizeLanguageName(raw: string): string {
  return raw
    .trim()
    .replace(/\b#/g, "sharp")
    .replace(/\b\+\+/g, "pp")
    .toLowerCase();
}

export function resolveLezerId(language: string): string | undefined {
  const normalized = language.trim().toLowerCase();
  return (
    LEZER_ALIASES.get(normalized) ??
    LEZER_ALIASES.get(normalizeLanguageName(language))
  );
}

const KEYWORD_TAGS = [
  t.keyword,
  t.modifier,
  t.operatorKeyword,
  t.controlKeyword,
  t.definitionKeyword,
  t.moduleKeyword,
  t.processingInstruction,
];

const FUNCTION_TAGS = [
  t.function(t.variableName),
  t.function(t.propertyName),
  t.function(t.definition(t.variableName)),
  t.function(t.definition(t.propertyName)),
];

const CONSTANT_TAGS = [
  t.null,
  t.atom,
  t.color,
  t.unit,
  t.constant(t.variableName),
  t.constant(t.definition(t.variableName)),
  t.special(t.variableName),
];

const OPERATOR_TAGS = [
  t.operator,
  t.compareOperator,
  t.arithmeticOperator,
  t.logicOperator,
  t.bitwiseOperator,
  t.updateOperator,
  t.definitionOperator,
  t.typeOperator,
  t.controlOperator,
  t.derefOperator,
];

const PUNCTUATION_TAGS = [
  t.punctuation,
  t.separator,
  t.bracket,
  t.angleBracket,
  t.paren,
  t.squareBracket,
  t.brace,
  t.contentSeparator,
];

export const lezerTagHighlighter = tagHighlighter([
  { tag: KEYWORD_TAGS, class: "token keyword" },
  { tag: [t.heading, t.strong], class: "token important" },
  {
    tag: [t.typeName, t.className, t.standard(t.typeName)],
    class: "token type class-name",
  },
  { tag: FUNCTION_TAGS, class: "token function" },
  {
    tag: [t.propertyName, t.definition(t.propertyName)],
    class: "token property",
  },
  { tag: [t.attributeName], class: "token attr-name" },
  { tag: [t.attributeValue], class: "token attr-value" },
  { tag: [t.tagName], class: "token tag" },
  { tag: [t.string, t.special(t.string), t.monospace], class: "token string" },
  { tag: [t.regexp], class: "token regex" },
  { tag: [t.number, t.integer, t.float], class: "token number" },
  { tag: [t.bool], class: "token boolean" },
  { tag: CONSTANT_TAGS, class: "token constant" },
  { tag: [t.standard(t.variableName)], class: "token builtin" },
  { tag: [t.definition(t.variableName)], class: "token variable" },
  { tag: [t.namespace], class: "token namespace" },
  {
    tag: [t.lineComment, t.blockComment, t.docComment, t.comment],
    class: "token comment",
  },
  { tag: OPERATOR_TAGS, class: "token operator" },
  { tag: PUNCTUATION_TAGS, class: "token punctuation" },
  { tag: [t.inserted], class: "token inserted" },
  { tag: [t.deleted], class: "token deleted" },
]);

function registerParser(id: string, parser: Parser): void {
  loadedLezer.set(id, { id, parser });
}

export const lezerLoaders: ReadonlyMap<string, () => Promise<void>> = new Map([
  [
    "go",
    async () => {
      const { parser } = await import("@lezer/go");
      registerParser(
        "go",
        parser.configure({
          props: [
            styleTags({
              "make new": t.standard(t.variableName),
              "Key/VariableName": t.propertyName,
              "MethodDecl/FieldName MethodElem/FieldName": t.function(
                t.definition(t.propertyName),
              ),
              "CallExpr/SelectorExpr/FieldName": t.function(t.propertyName),
              "CallExpr/ParameterizedExpr/SelectorExpr/FieldName": t.function(
                t.propertyName,
              ),
              "CallExpr/ParameterizedExpr/VariableName": t.function(
                t.variableName,
              ),
              "ConstSpec/DefName": t.constant(t.definition(t.variableName)),
              "QualifiedType/VariableName": t.namespace,
            }),
          ],
        }),
      );
    },
  ],
  [
    "javascript",
    async () => {
      const { parser } = await import("@lezer/javascript");
      registerParser("javascript", parser);
    },
  ],
  [
    "typescript",
    async () => {
      const { parser } = await import("@lezer/javascript");
      registerParser("typescript", parser.configure({ dialect: "ts" }));
    },
  ],
  [
    "jsx",
    async () => {
      const { parser } = await import("@lezer/javascript");
      registerParser("jsx", parser.configure({ dialect: "jsx" }));
    },
  ],
  [
    "tsx",
    async () => {
      const { parser } = await import("@lezer/javascript");
      registerParser("tsx", parser.configure({ dialect: "ts jsx" }));
    },
  ],
  [
    "python",
    async () => {
      const { parser } = await import("@lezer/python");
      registerParser(
        "python",
        parser.configure({
          props: [styleTags({ "TypeDef/VariableName": t.typeName })],
        }),
      );
    },
  ],
  [
    "rust",
    async () => {
      const { parser } = await import("@lezer/rust");
      registerParser("rust", parser);
    },
  ],
  [
    "c",
    async () => {
      const { parser } = await import("@lezer/cpp");
      registerParser("c", parser);
    },
  ],
  [
    "cpp",
    async () => {
      const { parser } = await import("@lezer/cpp");
      registerParser("cpp", parser);
    },
  ],
  [
    "java",
    async () => {
      const { parser } = await import("@lezer/java");
      registerParser(
        "java",
        parser.configure({
          props: [
            styleTags({
              "ClassDeclaration/Definition InterfaceDeclaration/Definition EnumDeclaration/Definition AnnotationTypeDeclaration/Definition":
                t.definition(t.className),
              "MethodDeclaration/Definition ConstructorDeclaration/Definition":
                t.function(t.definition(t.variableName)),
              "FieldAccess/Identifier": t.propertyName,
            }),
          ],
        }),
      );
    },
  ],
  [
    "json",
    async () => {
      const { parser } = await import("@lezer/json");
      registerParser("json", parser);
    },
  ],
  [
    "html",
    async () => {
      const [
        { parser, configureNesting },
        { parser: jsParser },
        { parser: cssParser },
      ] = await Promise.all([
        import("@lezer/html"),
        import("@lezer/javascript"),
        import("@lezer/css"),
      ]);
      registerParser(
        "html",
        parser.configure({
          wrap: configureNesting([
            { tag: "script", parser: jsParser },
            { tag: "style", parser: cssParser },
          ]),
        }),
      );
    },
  ],
  [
    "xml",
    async () => {
      const { parser } = await import("@lezer/xml");
      registerParser("xml", parser);
    },
  ],
  [
    "css",
    async () => {
      const { parser } = await import("@lezer/css");
      registerParser("css", parser);
    },
  ],
  [
    "scss",
    async () => {
      const { parser } = await import("@lezer/sass");
      registerParser("scss", parser);
    },
  ],
  [
    "sass",
    async () => {
      const { parser } = await import("@lezer/sass");
      registerParser("sass", parser.configure({ dialect: "indented" }));
    },
  ],
  [
    "sql",
    async () => {
      const { StandardSQL } = await import("@codemirror/lang-sql");
      registerParser("sql", StandardSQL.language.parser);
    },
  ],
  [
    "postgresql",
    async () => {
      const { PostgreSQL } = await import("@codemirror/lang-sql");
      registerParser("postgresql", PostgreSQL.language.parser);
    },
  ],
  [
    "mysql",
    async () => {
      const { MySQL } = await import("@codemirror/lang-sql");
      registerParser("mysql", MySQL.language.parser);
    },
  ],
  [
    "sqlite",
    async () => {
      const { SQLite } = await import("@codemirror/lang-sql");
      registerParser("sqlite", SQLite.language.parser);
    },
  ],
  [
    "yaml",
    async () => {
      const { parser } = await import("@lezer/yaml");
      registerParser("yaml", parser);
    },
  ],
  [
    "php",
    async () => {
      const { parser } = await import("@lezer/php");
      registerParser(
        "php",
        parser.configure({
          props: [styleTags({ VariableName: t.definition(t.variableName) })],
        }),
      );
    },
  ],
  [
    "markdown",
    async () => {
      const { parser: mdParser, parseCode } = await import("@lezer/markdown");
      registerParser(
        "markdown",
        mdParser.configure([
          parseCode({
            codeParser(info: string): Parser | null {
              const label = info.trim().split(/\s+/)[0];
              const id = label ? resolveLezerId(label) : undefined;
              if (!id || id === "markdown") {
                return null;
              }
              return loadedLezer.get(id)?.parser ?? null;
            },
          }),
        ]),
      );
    },
  ],
]);
