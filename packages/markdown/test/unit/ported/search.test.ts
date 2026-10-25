import test from "node:test";
import assert from "node:assert/strict";
import { parseSearch, searchesFiles } from "../../../src/markdown/search/query";
import { compileSearch } from "../../../src/markdown/search/evaluate";

test("search gives implicit AND precedence over OR and supports grouped negation", () => {
  assert.deepEqual(parseSearch("meeting work OR meetup personal"), {
    kind: "or",
    terms: [
      {
        kind: "and",
        terms: [
          { kind: "text", value: "meeting" },
          { kind: "text", value: "work" },
        ],
      },
      {
        kind: "and",
        terms: [
          { kind: "text", value: "meetup" },
          { kind: "text", value: "personal" },
        ],
      },
    ],
  });
  assert.deepEqual(parseSearch("-(work OR meetup)"), {
    kind: "not",
    term: {
      kind: "or",
      terms: [
        { kind: "text", value: "work" },
        { kind: "text", value: "meetup" },
      ],
    },
  });
});
test("search parses quoted paths, escaped phrases, regexes and nested scopes", () => {
  assert.deepEqual(parseSearch('path:"Daily notes/2022"'), {
    kind: "scope",
    scope: "path",
    term: { kind: "text", value: "Daily notes/2022" },
  });
  assert.deepEqual(parseSearch(String.raw`"they said \"hello\""`), {
    kind: "text",
    value: 'they said "hello"',
  });
  assert.deepEqual(parseSearch("path:/\\d{4}[-/]\\d{2}/"), {
    kind: "scope",
    scope: "path",
    term: { kind: "regex", value: "\\d{4}[-/]\\d{2}", flags: "" },
  });
  assert.equal(parseSearch("task:(call OR email)").kind, "scope");
  assert.equal(
    parseSearch("match-case:(HappyCat -ignore-case:dog)").kind,
    "scope",
  );
});
test("search property filters preserve existence, alternatives and numeric comparisons", () => {
  assert.deepEqual(parseSearch("[aliases]"), {
    kind: "property",
    name: { kind: "text", value: "aliases" },
  });
  assert.deepEqual(parseSearch("[duration:<5]"), {
    kind: "property",
    name: { kind: "text", value: "duration" },
    value: { kind: "text", value: "<5" },
  });
  assert.deepEqual(parseSearch("[number:-5]"), {
    kind: "property",
    name: { kind: "text", value: "number" },
    value: { kind: "text", value: "-5" },
  });
  assert.equal(parseSearch("[status:Draft OR Published]").kind, "property");
  assert.equal(parseSearch("[aliases:null]").kind, "property");
  assert.deepEqual(parseSearch("tag:#project status:done"), {
    kind: "and",
    terms: [
      {
        kind: "scope",
        scope: "tag",
        term: { kind: "text", value: "#project" },
      },
      {
        kind: "property",
        name: { kind: "text", value: "status" },
        value: { kind: "text", value: "done" },
      },
    ],
  });
});
test("malformed or unsupported searches fail rather than silently becoming literal text", () => {
  for (const query of [
    "",
    "word OR",
    "(word",
    "word)",
    "[status:",
    '"unclosed',
    "/[bad/",
    "status:",
    "path:",
    "-",
  ]) {
    assert.throws(() => parseSearch(query), /character/);
  }
});

test("document search evaluates Boolean expressions, paths and scoped case sensitivity", () => {
  const document = {
    path: "Daily notes/2022-07.md",
    text: "Meeting with HappyCat about work.",
  };
  for (const query of [
    "meeting work",
    "meeting OR absent",
    "meeting -(absent other)",
    'path:"Daily notes" file:/2022-\\d{2}/',
    "match-case:HappyCat",
    "ignore-case:HAPPYCAT",
  ]) {
    assert.equal(compileSearch(query)(document), true, query);
  }
  for (const query of [
    "meeting -work",
    "match-case:happycat",
    "meeting (absent OR other)",
    "content:Daily",
  ]) {
    assert.equal(compileSearch(query)(document), false, query);
  }
  assert.equal(
    compileSearch("file:.jpg")({ path: "images/photo.jpg", text: "" }),
    true,
  );
  assert.equal(
    compileSearch("-meeting")({ path: "images/photo.jpg", text: "" }),
    false,
  );
  assert.equal(
    compileSearch("file:.canvas")({ path: "Broken.canvas", text: "{broken" }),
    true,
  );
});

test("line, block and section scopes keep all terms inside the requested region", () => {
  const document = {
    path: "Note.md",
    text: "# First\n\ndog\ncat\n\nSeparated paragraph\n\n# Second\n\nbird",
  };
  assert.equal(compileSearch("dog cat")(document), true);
  assert.equal(compileSearch("line:(dog cat)")(document), false);
  assert.equal(compileSearch("block:(dog cat)")(document), true);
  assert.equal(compileSearch("block:(cat Separated)")(document), false);
  assert.equal(compileSearch("section:(cat Separated)")(document), true);
  assert.equal(compileSearch("section:(dog bird)")(document), false);
});

test("task search excludes code and distinguishes custom completion markers", () => {
  const document = {
    path: "Tasks.md",
    text: "- [ ] call\n  client\n- [x] email\n- [!] follow up\n\n```md\n- [ ] fake task\n```",
  };
  assert.equal(compileSearch("task-todo:(call client)")(document), true);
  assert.equal(compileSearch("task-done:(email OR follow)")(document), true);
  assert.equal(compileSearch("task-todo:follow")(document), false);
  assert.equal(compileSearch("task:fake")(document), false);
});

test("property filters distinguish null and empty values and compare numeric properties", () => {
  const document = {
    path: "Properties.md",
    text: '---\naliases: [Draft, Published]\nduration: 4\nempty: null\nquoted: ""\nlist: []\ntextNumber: "4"\n---\nBody',
  };
  for (const query of [
    "[aliases]",
    "[aliases:Draft OR Published]",
    "aliases:Draft",
    "[duration:<5]",
    "duration:<5",
    "[duration:>=4]",
    "[empty:null]",
    '[quoted:""]',
  ]) {
    assert.equal(compileSearch(query)(document), true, query);
  }
  for (const query of [
    "[absent]",
    "[duration:>5]",
    "[quoted:null]",
    "[list:null]",
    '[empty:""]',
    "[textNumber:<5]",
  ]) {
    assert.equal(compileSearch(query)(document), false, query);
  }
});

test("tag search uses parsed tags and Canvas search uses card contents", () => {
  const document = {
    path: "Tags.md",
    text: "---\ntags: [Project/Notes]\n---\n\n#body `#code`",
  };
  assert.equal(compileSearch("tag:#project")(document), true);
  assert.equal(compileSearch("tag:(Project body)")(document), true);
  assert.equal(compileSearch("tag:code")(document), false);
  const canvas = {
    path: "Board.canvas",
    text: JSON.stringify({
      nodes: [
        {
          id: "n",
          type: "text",
          text: "Canvas words #tag",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
      ],
    }),
  };
  assert.equal(compileSearch("Canvas words")(canvas), true);
  assert.equal(compileSearch("tag:tag")(canvas), false);
});

test("file-search detection traverses negation and Boolean groups but not property literals", () => {
  assert.equal(searchesFiles(parseSearch("-(tag:one OR path:notes)")), true);
  assert.equal(searchesFiles(parseSearch("[name:file:notes]")), false);
  assert.equal(searchesFiles(parseSearch("content:(one OR two)")), false);
  assert.deepEqual(parseSearch("[count:-12]"), {
    kind: "property",
    name: { kind: "text", value: "count" },
    value: { kind: "text", value: "-12" },
  });
});

test("parser retains exact error offsets after groups and property values", () => {
  assert.throws(() => parseSearch("(one"), {
    message: "Unclosed group at character 5.",
  });
  assert.throws(() => parseSearch("[key:value"), {
    message: "Unclosed property filter at character 11.",
  });
  assert.throws(() => parseSearch("one OR"), {
    message: "Expected a search term at character 7.",
  });
});
