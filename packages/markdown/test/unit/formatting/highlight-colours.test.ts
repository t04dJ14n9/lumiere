import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import { createRenderer } from "../../../src/markdown/html";
import { toggleHighlightColour } from "../../../src/plugins/formatting/highlight-colour";
import { wrapSelection } from "../../../src/plugins/formatting/inline";
import { highlightColourSuggestion } from "../../../src/plugins/formatting/highlight-suggest";
import { localCompletions } from "../../../src/plugins/suggest/webview";
import { HIGHLIGHT_COLOURS } from "../../../src/markdown/dialect/highlight";

function run(command: Command, doc: string, from: number, to = from) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.range(from, to),
    extensions: markdownLanguageSupport(),
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorView["dispatch"]>[0]) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  command(view);
  const { anchor, head } = state.selection.main;
  return { text: state.doc.toString(), selection: [anchor, head] };
}

// Every expected text below is what Obsidian 1.14.4 made of the same text and
// selection, and the selection where it is the same text.
test("a colour wraps the word or selection, its emoji after the opening ==", () => {
  const blue = toggleHighlightColour("blue");
  assert.deepEqual(run(blue, "one two three", 4, 7), {
    text: "one ==🔵two== three",
    selection: [8, 11],
  });
  assert.deepEqual(run(blue, "one two three", 5), {
    text: "one ==🔵two== three",
    selection: [9, 9],
  });
  assert.deepEqual(run(blue, "one two three", 3), {
    text: "==🔵one== two three",
    selection: [7, 7],
  });
  assert.deepEqual(run(toggleHighlightColour("orange"), "", 0), {
    text: "==🟠==",
    selection: [4, 4],
  });
  assert.deepEqual(
    run(toggleHighlightColour("purple"), "line one\nline two", 0, 17),
    { text: "==🟣line one==\n==🟣line two==", selection: [4, 27] },
  );
  // Spaces alone are left alone.
  assert.equal(
    run(blue, "one ==two three== four", 9, 10).text,
    "one ==two three== four",
  );
});

test("a highlight takes another colour, and loses its own", () => {
  const cases: [string, number, number, string, string][] = [
    ["one ==two== three", 7, 7, "blue", "one ==🔵two== three"],
    ["one ==two== three", 6, 9, "blue", "one ==🔵two== three"],
    ["one ==two== three", 4, 11, "green", "one ==🟢two== three"],
    ["one ==🔵two== three", 8, 8, "red", "one ==🔴two== three"],
    ["one ==🔵two== four", 4, 4, "red", "one ==🔴two== four"],
    ["one ==🔵two== four", 13, 13, "red", "one ==🔴two== four"],
    ["one ==🔵two== three", 8, 8, "blue", "one two three"],
    ["one ==🔵two== three", 6, 11, "blue", "one two three"],
    ["one ==🔵two three== four", 8, 17, "blue", "one two three four"],
    ["one ==🔵two three== four", 12, 17, "blue", "one two three four"],
    ["x ==🔵a b c== y", 6, 7, "blue", "x a b c y"],
    ["one ==two three== four", 6, 15, "blue", "one ==🔵two three== four"],
    ["one ==🔵two three== four", 8, 17, "red", "one ==🔴two three== four"],
  ];
  for (const [doc, from, to, colour, expected] of cases) {
    const command = toggleHighlightColour(colour as "red");
    assert.equal(run(command, doc, from, to).text, expected, `${doc} ${from}`);
  }
});

test("part of a highlight is split off in the new colour; spanned ones merge", () => {
  const cases: [string, number, number, string, string][] = [
    [
      "one ==🔵two three== four",
      12,
      17,
      "red",
      "one ==🔵two== ==🔴three== four",
    ],
    [
      "one ==🔵two three four== five",
      12,
      17,
      "red",
      "one ==🔵two== ==🔴three== ==🔵four== five",
    ],
    ["one ==two three== four", 6, 9, "green", "one ==🟢two== ==three== four"],
    ["one ==two three== four", 0, 9, "blue", "==🔵one two== ==three== four"],
    ["one ==two three== four", 10, 22, "blue", "one ==two== ==🔵three four=="],
    ["a ==b== c ==d== e", 0, 17, "blue", "==🔵a b c d e=="],
    ["==🔵one== ==🔴two==", 0, 19, "green", "==🟢one two=="],
  ];
  for (const [doc, from, to, colour, expected] of cases) {
    const command = toggleHighlightColour(colour as "red");
    assert.equal(run(command, doc, from, to).text, expected, `${doc} ${from}`);
  }
  // The selection stays on the selected text.
  assert.deepEqual(
    run(toggleHighlightColour("blue"), "one ==two three== four", 10, 22)
      .selection,
    [16, 26],
  );
});

test("Toggle bold, italics and highlight unwrap the span a selection is in, as in 1.14", () => {
  const cases: [string, string, number, number, string][] = [
    ["**", "one **two three** four", 10, 15, "one two three four"],
    ["**", "one **two three** four", 6, 9, "one two three four"],
    ["**", "one **two three** four", 8, 12, "one two three four"],
    ["**", "one **two three four** five", 10, 15, "one two three four five"],
    ["*", "one *two three* four", 9, 14, "one two three four"],
    ["==", "one ==two three== four", 10, 15, "one two three four"],
    ["==", "one ==🔵two three== four", 12, 17, "one two three four"],
    ["==", "one ==🔵two three== four", 8, 17, "one two three four"],
    ["==", "one ==🔵two== three", 8, 8, "one two three"],
  ];
  for (const [marker, doc, from, to, expected] of cases) {
    assert.equal(
      run(wrapSelection(marker), doc, from, to).text,
      expected,
      `${marker} ${doc} ${from}`,
    );
  }
  // A selection over a span and around it merges them into one.
  assert.deepEqual(run(wrapSelection("**"), "one **two** three", 0, 17), {
    text: "**one two three**",
    selection: [2, 15],
  });
  assert.deepEqual(run(wrapSelection("**"), "one **two** three", 2, 8), {
    text: "on**e two** three",
    selection: [4, 8],
  });
});

test("a coloured highlight renders as a mark with its colour, the emoji dropped", () => {
  const { renderInline } = createRenderer();
  assert.equal(
    renderInline("==🔵blue text== y"),
    '<mark data-highlight="blue">blue text</mark> y',
  );
  assert.equal(renderInline("==plain=="), "<mark>plain</mark>");
  assert.equal(renderInline("==⚪white=="), "<mark>⚪white</mark>");
  assert.equal(
    renderInline("==🔵== empty"),
    '<mark data-highlight="blue"></mark> empty',
  );
});

test("typing == that opens a highlight offers the colours, as in Obsidian 1.14", () => {
  const offered = (before: string, after = "") => {
    const state = EditorState.create({
      doc: before + after,
      extensions: markdownLanguageSupport(),
    });
    return highlightColourSuggestion({ state, pos: before.length });
  };
  const list = offered("word ==");
  assert.deepEqual(
    list?.options.map((option) => option.label),
    ["Default", "Red", "Orange", "Yellow", "Green", "Blue", "Purple"],
  );
  assert.equal(list?.options[0]?.swatch, "default");
  assert.equal(list?.options[5]?.swatch, "blue");
  // Measured where Obsidian offers them and where it does not.
  assert.ok(offered("a=="));
  assert.ok(offered("x ==", "y"));
  assert.ok(offered("==", "text=="));
  assert.ok(offered("- =="));
  assert.equal(offered("==text=="), undefined);
  assert.equal(offered("==="), undefined);
  assert.equal(offered("$x==", "$"), undefined);
  assert.equal(offered("word =", ""), undefined);
});

function acceptColour(label: string): Command {
  return (view) => {
    const pos = view.state.selection.main.head;
    const list = highlightColourSuggestion({ state: view.state, pos });
    assert.ok(list);
    const completion = localCompletions(list).options.find(
      (option) => option.label === label,
    );
    assert.ok(completion);
    assert.equal(typeof completion.apply, "function");
    if (typeof completion.apply === "function") {
      completion.apply(view, completion, list.at, pos);
    }
    return true;
  };
}

const colours = [
  ["Default", ""],
  ...Object.entries(HIGHLIGHT_COLOURS).map(([colour, emoji]) => [
    colour[0]!.toUpperCase() + colour.slice(1),
    emoji,
  ]),
] as [string, string][];

test("accepting Default or a colour wraps the following word, including inside bold", () => {
  for (const [label, emoji] of colours) {
    for (const [before, word, after] of [
      ["==", "word", " tail"],
      ["A **==", "hard", "** line break"],
      ["*==", "café", "*"],
      ["==", "中文", ""],
    ] as const) {
      const pos = before.length;
      assert.deepEqual(run(acceptColour(label), before + word + after, pos), {
        text: `${before}${emoji}${word}==${after}`,
        selection: [pos + emoji.length, pos + emoji.length],
      });
    }
  }
});

test("accepting a colour reuses a following word's closing ==; Default keeps the text", () => {
  for (const [label, emoji] of colours) {
    for (const [before, after] of [
      ["==", "word== tail"],
      ["A **==", "hard==** line break"],
    ] as const) {
      const pos = before.length;
      assert.deepEqual(run(acceptColour(label), before + after, pos), {
        text: `${before}${emoji}${after}`,
        selection: [pos + emoji.length, pos + emoji.length],
      });
    }
  }
});

test("accepting a colour keeps the empty pair before EOF, whitespace or punctuation", () => {
  for (const [label, emoji] of colours) {
    for (const after of ["", " next", "\nnext", ".word", "!", "**"]) {
      assert.deepEqual(run(acceptColour(label), `==${after}`, 2), {
        text: `==${emoji}==${after}`,
        selection: [2 + emoji.length, 2 + emoji.length],
      });
    }
  }
});

test("a local colour acceptance reads the current word at the mapped completion range", () => {
  const original = EditorState.create({ doc: "==old" });
  const list = highlightColourSuggestion({ state: original, pos: 2 });
  assert.ok(list);
  const red = list.options.find((option) => option.label === "Red");
  assert.ok(red);
  const current = EditorState.create({
    doc: "A **==hard** line",
    extensions: markdownLanguageSupport(),
  });
  const next = current.update(red.apply(current, { from: 6, to: 6 })).state;
  assert.equal(next.doc.toString(), "A **==🔴hard==** line");
  assert.equal(next.selection.main.head, 8);
});
