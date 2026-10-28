import assert from "node:assert/strict";
import test from "node:test";
import { prismFixture, splitPrismFixture } from "../../support/prism";

test("the real highlighter initializes no grammars until a language is requested", async () => {
  const fixture = (await prismFixture(true))();
  const { Prism, highlighter } = fixture;
  assert.ok(highlighter);
  for (const language of ["typescript", "javascript", "python", "rust", "go"]) {
    assert.equal(highlighter.isLezerLanguageLoaded(language), false);
    assert.equal(Prism.languages[language], undefined);
  }
  await highlighter.loadLanguage("not-a-language");
  assert.equal(highlighter.isLezerLanguageLoaded("ts"), false);
  assert.equal(Prism.languages.typescript, undefined);
  await Promise.all([
    highlighter.loadLanguage("ts"),
    highlighter.loadLanguage("typescript"),
  ]);
  assert.equal(highlighter.isLezerLanguageLoaded("ts"), true);
  assert.equal(highlighter.isLezerLanguageLoaded("typescript"), true);
  assert.equal(highlighter.isLezerLanguageLoaded("python"), false);
  assert.equal(highlighter.isLezerLanguageLoaded("rust"), false);
  // Lezer handles TypeScript directly without loading Prism's typescript grammar.
  assert.equal(Prism.languages.typescript, undefined);
  assert.ok(highlighter.tokenRanges("const value: number = 1;", "ts").length);
});

test("webview ESM chunks load Lezer and fallback languages concurrently", async () => {
  const eager = (await prismFixture(true))();
  const split = await splitPrismFixture();
  try {
    assert.equal(split.highlighter!.isLezerLanguageLoaded("ts"), false);
    assert.equal(split.highlighter!.isLezerLanguageLoaded("python"), false);
    assert.equal(split.Prism.languages.csharp, undefined);
    await Promise.all([
      split.highlighter!.loadLanguage("ts"),
      split.highlighter!.loadLanguage("python"),
      split.highlighter!.loadLanguage("csharp"),
      eager.highlighter!.loadLanguage("ts"),
      eager.highlighter!.loadLanguage("python"),
      eager.highlighter!.loadLanguage("csharp"),
    ]);
    assert.equal(split.highlighter!.isLezerLanguageLoaded("rust"), false);
    assert.equal(split.Prism.languages.ruby, undefined);
    for (const [language, source] of [
      ["ts", "const sql = sql`SELECT value FROM table`;"],
      ["python", "def example(n): return n + 1"],
      ["csharp", "class Example { int value = 1; }"],
    ] as const) {
      assert.equal(
        JSON.stringify(split.highlighter!.tokenRanges(source, language)),
        JSON.stringify(eager.highlighter!.tokenRanges(source, language)),
      );
    }
  } finally {
    await split.dispose();
  }
});

test("Lezer Go highlighter classifies keywords, types, struct field keys, constants, and method calls", async () => {
  const { highlighter } = (await prismFixture(true))();
  assert.ok(highlighter);
  const goSource = [
    "func HandleStatus(resp *Response) error {",
    "    if resp.Status != StatusCode_OK {",
    "        if resp.Status == StatusCode_Throttled {",
    "            return &RpcError{",
    "                Code:   ErrCode_Overload,",
    "                Detail: errors.New(resp.Message),",
    "            }",
    "        }",
    "        return &RpcError{",
    "            Code:   ErrCode_RemoteFailure,",
    "            Detail: errors.New(resp.Message),",
    "        }",
    "    }",
    "    return nil",
    "}",
  ].join("\n");

  await highlighter.loadLanguage("go");
  const ranges = highlighter.tokenRanges(goSource, "go");
  const tokenMap = new Map<string, Set<string>>();
  for (const r of ranges) {
    const text = goSource.slice(r.from, r.to);
    const set = tokenMap.get(text) ?? new Set<string>();
    set.add(r.classes);
    tokenMap.set(text, set);
  }

  // Keywords
  for (const kw of ["func", "if", "return"]) {
    assert.ok(
      tokenMap.get(kw)?.has("token keyword"),
      `Expected ${kw} to have "token keyword"`,
    );
  }
  // Types (both user-defined TypeName and built-in error)
  for (const ty of ["Response", "RpcError", "error"]) {
    assert.ok(
      tokenMap.get(ty)?.has("token type class-name"),
      `Expected ${ty} to have "token type class-name"`,
    );
  }
  // Struct literal field keys and selector properties
  for (const prop of ["Code", "Detail", "Status", "Message"]) {
    assert.ok(
      tokenMap.get(prop)?.has("token property"),
      `Expected ${prop} to have "token property"`,
    );
  }
  // Constants and nil
  for (const c of [
    "StatusCode_OK",
    "StatusCode_Throttled",
    "ErrCode_Overload",
    "ErrCode_RemoteFailure",
    "nil",
  ]) {
    assert.ok(
      tokenMap.get(c)?.has("token constant"),
      `Expected ${c} to have "token constant"`,
    );
  }
  // Function declaration and selector call
  assert.ok(tokenMap.get("HandleStatus")?.has("token function"));
  assert.ok(tokenMap.get("New")?.has("token function"));
  assert.ok(tokenMap.get("errors")?.has("token namespace"));
});

test("lazy languages highlight Lezer and fallback grammars, aliases, embedded syntax and UTF-16 token offsets", async () => {
  const lazy = (await prismFixture(true))();
  const highlighter = lazy.highlighter;
  assert.ok(highlighter);
  const examples: [string, string, string[]][] = [
    [
      "ts",
      "const value: number = 1;\nconst tag = /abc/g;\nconst css = css`a { color: red; }`;",
      ["token keyword", "token type class-name", "token regex", "token string"],
    ],
    [
      "js",
      "/** @param {number} n */\nfunction example(n) { return Promise.resolve(n); }",
      ["token comment", "token keyword", "token function"],
    ],
    [
      "python",
      "def example(n):\n    return '😀' + str(n) # comment",
      [
        "token keyword",
        "token function",
        "token string",
        "token builtin",
        "token comment",
      ],
    ],
    [
      "rust",
      'fn main() { let count: u32 = 42; println!("hello"); }',
      [
        "token keyword",
        "token function",
        "token type class-name",
        "token number",
        "token string",
      ],
    ],
    [
      "html",
      '<div class="note"><style>a { color: red; }</style><script>const value = /a/g;</script></div>',
      [
        "token tag",
        "token attr-name",
        "token attr-value",
        "token property",
        "token keyword",
        "token regex",
      ],
    ],
    [
      "md",
      "# Heading\n\n```python\ndef example(): pass\n```\n\n---\ntitle: Note\n---",
      ["token important", "token keyword", "token function"],
    ],
    [
      "tsx",
      "const view = <div value={42}>hello</div>;",
      ["token keyword", "token tag", "token attr-name", "token number"],
    ],
    [
      "java",
      "/** @param value the <em>value</em> */\nclass Example { String name; }",
      ["token comment", "token keyword", "token type class-name"],
    ],
    [
      "php",
      "<?php /** @var string $value */ $value = 'hello'; ?>",
      ["token comment", "token variable", "token string"],
    ],
    [
      "cpp",
      "#include <stdio.h>\nint main() { return 0; }",
      [
        "token keyword",
        "token type class-name",
        "token function",
        "token number",
      ],
    ],
    [
      "sql",
      "SELECT id, name FROM users WHERE active = true;",
      ["token keyword", "token boolean"],
    ],
    [
      "yaml",
      "enabled: true\ncount: 42\nlabel: hello # note",
      [
        "token property",
        "token boolean",
        "token number",
        "token string",
        "token comment",
      ],
    ],
    [
      "csharp",
      "/// <summary>A value</summary>\nclass Example { int value = 1; }",
      ["token keyword", "token number"],
    ],
    [
      "json",
      '{"value": 1, "text": "😀", "ok": true}',
      ["token property", "token number", "token string", "token boolean"],
    ],
  ];
  for (const [language, source, expectedClasses] of examples) {
    await highlighter.loadLanguage(language, source);
    const code = {
      className: `language-${language}`,
      textContent: source,
      innerHTML: "",
    };
    highlighter.highlight(code as HTMLElement);
    assert.ok(code.innerHTML.includes('<span class="token '), language);
    const ranges = highlighter.tokenRanges(source, language);
    assert.ok(ranges.length > 0, `${language} should emit token ranges`);
    for (const range of ranges) {
      assert.ok(
        range.from >= 0 && range.to <= source.length && range.from < range.to,
        `${language}: invalid range [${range.from}, ${range.to}] for length ${source.length}`,
      );
      assert.ok(
        range.classes.startsWith("token "),
        `${language}: ${range.classes}`,
      );
    }
    for (const expectedClass of expectedClasses) {
      assert.ok(
        ranges.some((r) => r.classes.includes(expectedClass)),
        `Expected ${language} to produce "${expectedClass}", got: ${[...new Set(ranges.map((r) => r.classes))].join(", ")}`,
      );
    }
  }
});

test("a first Markdown fence loads its embedded Lezer and Prism languages on demand", async () => {
  const lazy = (await prismFixture(true))();
  const source =
    "```python\ndef example(): pass\n```\n\n```C++\nint main() { return 0; }\n```\n\n```csharp\nclass A { decimal x = 1; }\n```";
  await lazy.highlighter!.loadLanguage("md", source);
  assert.equal(lazy.highlighter!.isLezerLanguageLoaded("python"), true);
  assert.equal(lazy.highlighter!.isLezerLanguageLoaded("cpp"), true);
  assert.ok(lazy.Prism.languages.csharp);
  assert.equal(lazy.highlighter!.isLezerLanguageLoaded("rust"), false);
  const ranges = lazy.highlighter!.tokenRanges(source, "md");
  const texts = new Map(
    ranges.map((r) => [source.slice(r.from, r.to), r.classes]),
  );
  assert.equal(texts.get("def"), "token keyword");
  assert.equal(texts.get("example"), "token function");
  assert.equal(texts.get("int"), "token type class-name");
  assert.equal(texts.get("return"), "token keyword");
  assert.ok(texts.get("class")?.includes("keyword"));
});

test("shared Prism fallback grammar modifiers preserve languages requested later", async () => {
  const eager = (await prismFixture(false))();
  const lazy = (await prismFixture(true))();
  await lazy.highlighter!.loadLanguage("fsharp");
  await lazy.highlighter!.loadLanguage("csharp");
  const source =
    "/// <summary>A value</summary>\nclass Example { int value = 1; }";
  assert.equal(
    lazy.Prism.highlight(source, lazy.Prism.languages.csharp!, "csharp"),
    eager.Prism.highlight(source, eager.Prism.languages.csharp!, "csharp"),
  );
});
