import assert from "node:assert/strict";
import test from "node:test";
import { prismFixture, splitPrismFixture } from "../../support/prism";

test("the real highlighter initializes no grammars until a language is requested", async () => {
  const fixture = (await prismFixture(true))();
  const { Prism, highlighter } = fixture;
  assert.ok(highlighter);
  for (const language of ["typescript", "javascript", "python", "rust"]) {
    assert.equal(Prism.languages[language], undefined);
  }
  await highlighter.loadLanguage("not-a-language");
  assert.equal(Prism.languages.typescript, undefined);
  await Promise.all([
    highlighter.loadLanguage("ts"),
    highlighter.loadLanguage("typescript"),
  ]);
  assert.ok(Prism.languages.typescript);
  assert.equal(Prism.languages.ts, Prism.languages.typescript);
  assert.equal(Prism.languages.python, undefined);
  assert.equal(Prism.languages.rust, undefined);
  assert.ok(highlighter.tokenRanges("const value: number = 1;", "ts").length);
});

test("webview ESM chunks load languages concurrently with the eager grammar behavior", async () => {
  const eager = (await prismFixture(false))();
  const split = await splitPrismFixture();
  try {
    assert.equal(split.Prism.languages.typescript, undefined);
    assert.equal(split.Prism.languages.python, undefined);
    await Promise.all([
      split.highlighter!.loadLanguage("ts"),
      split.highlighter!.loadLanguage("python"),
    ]);
    assert.equal(split.Prism.languages.rust, undefined);
    for (const [language, source] of [
      ["ts", "const sql = sql`SELECT value FROM table`;"],
      ["python", "def example(n): return n + 1"],
    ]) {
      assert.equal(
        split.Prism.highlight(
          source!,
          split.Prism.languages[language!]!,
          language!,
        ),
        eager.Prism.highlight(
          source!,
          eager.Prism.languages[language!]!,
          language!,
        ),
      );
    }
  } finally {
    await split.dispose();
  }
});

test("lazy languages preserve eager highlighting, aliases, embedded syntax and token offsets", async () => {
  const eager = (await prismFixture(false))();
  const lazy = (await prismFixture(true))();
  const highlighter = lazy.highlighter;
  assert.ok(highlighter);
  const examples: [string, string][] = [
    [
      "ts",
      "const value: number = 1;\nconst tag = /abc/g;\nconst css = css`a { color: red; }`;",
    ],
    [
      "js",
      "/** @param {number} n */\nfunction example(n) { return Promise.resolve(n); }",
    ],
    ["python", "def example(n):\n    return '😀' + str(n) # comment"],
    ["rust", 'fn main() { println!("hello"); }'],
    [
      "html",
      "<style>a { color: red; }</style><script>const value = /a/g;</script>",
    ],
    [
      "md",
      "# Heading\n\n```python\ndef example(): pass\n```\n\n---\ntitle: Note\n---",
    ],
    ["tsx", "const view = <div value={42}>hello</div>;"],
    [
      "java",
      "/** @param value the <em>value</em> */\nclass Example { String name; }",
    ],
    ["php", "<?php /** @var string $value */ $value = 'hello'; ?>"],
    ["cpp", "#include <stdio.h>\nint main() { return 0; }"],
    [
      "csharp",
      "/// <summary>A value</summary>\nclass Example { int value = 1; }",
    ],
    ["json", '{"value": 1, "text": "😀"}'],
  ];
  for (const [language, source] of examples) {
    await highlighter.loadLanguage(language, source);
    const grammar = eager.Prism.languages[language];
    assert.ok(grammar);
    const expected = eager.Prism.highlight(source, grammar, language);
    const code = {
      className: `language-${language}`,
      textContent: source,
      innerHTML: "",
    };
    highlighter.highlight(code as HTMLElement);
    assert.equal(code.innerHTML, expected, language);
    for (const range of highlighter.tokenRanges(source, language)) {
      assert.ok(
        range.from >= 0 && range.to <= source.length && range.from < range.to,
      );
      assert.ok(range.classes.startsWith("token "));
    }
  }
});

test("a first Markdown fence loads its embedded languages on demand", async () => {
  const eager = (await prismFixture(false))();
  const lazy = (await prismFixture(true))();
  const source =
    "```python\ndef example(): pass\n```\n\n```C++\nint main() { return 0; }\n```";
  await lazy.highlighter!.loadLanguage("md", source);
  assert.ok(lazy.Prism.languages.python);
  assert.ok(lazy.Prism.languages.cpp);
  assert.equal(lazy.Prism.languages.rust, undefined);
  assert.equal(
    lazy.Prism.highlight(source, lazy.Prism.languages.md!, "md"),
    eager.Prism.highlight(source, eager.Prism.languages.md!, "md"),
  );
});

test("shared grammar modifiers preserve languages requested later", async () => {
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
