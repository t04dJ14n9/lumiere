import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import type { LivePreview } from "../livePreview/api";
import { installBlockMotion } from "./motion";

function motionFixture(start = 0, target = 5) {
  let state = EditorState.create({
    doc: [
      "before text",
      "| alpha | beta |",
      "|-------|------|",
      "| gamma | delta|",
      "below text",
      "after text",
    ].join("\n"),
  });
  const view = {
    get state() {
      return state;
    },
    contentDOM: new EventTarget(),
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
    },
  } as unknown as EditorView;
  const cm = new CodeMirror(view);
  const mode = Vim.maybeInitVimState_(cm);
  const calls: { amount: number; goal: number | undefined }[] = [];
  cm.findPosV = (_start, amount, _unit, goal) => {
    calls.push({ amount, goal });
    return { line: target, ch: 7 };
  };
  cm.charCoords = (pos) => ({
    left: pos.ch * 10,
    top: pos.line * 20,
    bottom: pos.line * 20 + 20,
  });
  cm.getScrollInfo = () => ({
    left: 0,
    top: 0,
    height: 100,
    width: 100,
    clientHeight: 40,
    clientWidth: 100,
  });
  cm.defaultTextHeight = () => 20;
  cm.scrollTo = () => {};
  cm.setCursor(start, 2);
  const original = cm.findPosV;
  const preview: LivePreview = {
    mode: "livePreview",
    setMode() {},
    block: () => () => {},
    inline: () => () => {},
    renderedWidgets: () => [
      {
        kind: "Table",
        from: state.doc.line(2).from,
        to: state.doc.line(4).to,
        source: "",
      },
    ],
  };
  const installed = installBlockMotion(view, cm, () => preview);
  return { view, cm, mode, calls, original, installed, preview };
}

test("horizontal movement then gj/gk keeps the refreshed pixel goal and adapter column across tables", () => {
  for (const [start, target, expected, key] of [
    [0, 5, 1, "j"],
    [4, 0, 3, "k"],
  ] as const) {
    const f = motionFixture(start, target);
    try {
      f.mode.lastHPos = 1;
      Vim.handleKey(f.cm, "l", "api");
      assert.equal(f.cm.getCursor().ch, 3);
      assert.equal(f.mode.lastHPos, 1);
      Vim.handleKey(f.cm, "g", "api");
      Vim.handleKey(f.cm, key, "api");
      assert.equal(f.calls[0]?.goal, 30);
      assert.deepEqual({ ...f.cm.getCursor() }, { line: expected, ch: 7 });
      assert.equal(f.mode.lastHPos, 7);
    } finally {
      f.installed.destroy();
    }
  }
});

test("display-line counts and wrapped movement within a source line retain the adapter result", () => {
  for (const [target, count] of [
    [5, "2"],
    [0, ""],
  ] as const) {
    const f = motionFixture(0, target);
    try {
      f.mode.lastHPos = 1;
      Vim.handleKey(f.cm, "l", "api");
      if (count) {
        Vim.handleKey(f.cm, count, "api");
      }
      Vim.handleKey(f.cm, "g", "api");
      Vim.handleKey(f.cm, "j", "api");
      assert.deepEqual({ ...f.cm.getCursor() }, { line: target, ch: 7 });
      assert.equal(f.calls[0]?.goal, 30);
    } finally {
      f.installed.destroy();
    }
  }
});

test("j and dj keep the endpoint beyond a collapsed heading containing a hidden table", () => {
  for (const operator of [false, true]) {
    const f = motionFixture(0, 4);
    try {
      f.preview.renderedWidgets = () => [];
      f.preview.foldedRanges = (state) => [
        { from: state.doc.line(1).to, to: state.doc.line(4).to },
      ];
      if (operator) {
        Vim.handleKey(f.cm, "d", "api");
      }
      Vim.handleKey(f.cm, "j", "api");
      if (operator) {
        assert.equal(f.view.state.doc.toString(), "after text");
      } else {
        assert.equal(f.cm.getCursor().line, 4);
      }
    } finally {
      f.installed.destroy();
    }
  }
});

test("a replayed macro supplies resolved source-line context without keydown events", () => {
  const f = motionFixture();
  const register = Vim.getRegisterController().getRegister("a");
  register.keyBuffer.push("j");
  try {
    Vim.handleKey(f.cm, "@", "api");
    Vim.handleKey(f.cm, "a", "api");
    assert.equal(f.cm.getCursor().line, 1);
  } finally {
    register.clear();
    f.installed.destroy();
  }
});

test("half-page Ctrl-D/U preserves the display result rather than a stale source column", () => {
  for (const [start, target, key] of [
    [0, 5, "<C-d>"],
    [5, 0, "<C-u>"],
  ] as const) {
    const f = motionFixture(start, target);
    try {
      f.mode.lastHPos = 1;
      Vim.handleKey(f.cm, "l", "api");
      Vim.handleKey(f.cm, key, "api");
      assert.equal(f.calls[0]?.goal, 30);
      assert.deepEqual({ ...f.cm.getCursor() }, { line: target, ch: 7 });
    } finally {
      f.installed.destroy();
    }
  }
});

test("resolved source-line motions correct table overshoots, including a mapped command", () => {
  Vim.map("Q", "j", "normal");
  try {
    for (const key of ["j", "Q"]) {
      const f = motionFixture();
      try {
        Vim.handleKey(f.cm, "l", "api");
        Vim.handleKey(f.cm, key, "api");
        assert.deepEqual({ ...f.cm.getCursor() }, { line: 1, ch: 3 });
      } finally {
        f.installed.destroy();
      }
    }
  } finally {
    Vim.unmap("Q", "normal");
  }
});

test("page calls bypass correction and disposal restores the adapter and input-state property", () => {
  const f = motionFixture();
  f.mode.inputState.motion = "moveByLines";
  f.mode.inputState = { ...f.mode.inputState };
  assert.deepEqual(f.cm.findPosV({ line: 0, ch: 2 }, 1, "page"), {
    line: 5,
    ch: 7,
  });
  const current = f.mode.inputState;
  f.installed.destroy();
  assert.equal(f.cm.findPosV, f.original);
  assert.equal(f.mode.inputState, current);
  assert.equal(
    Object.getOwnPropertyDescriptor(f.mode, "inputState")?.get,
    undefined,
  );
});
