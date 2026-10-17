import { isMarpDocument } from "../../markdown/marp";
import { frontmatter } from "../../markdown/properties";
import { pageContract, yamlScalar } from "../../shared/wiki-page";
import { isInsidePath } from "../../shared/workspace-path";
import type { ResolvedLayout } from "../wiki/api";

export interface PromoteTarget {
  readonly type: string;
  readonly logical: string;
}

export const PROMOTE_TARGETS: readonly PromoteTarget[] = [
  { type: "Concept", logical: "concepts" },
  { type: "Source Summary", logical: "summaries" },
  { type: "Entity", logical: "entities" },
  { type: "Raw Source", logical: "raw" },
];

const SECTIONS: Readonly<Record<string, readonly string[]>> = {
  Concept: [
    "Definition",
    "Explanation",
    "Examples",
    "Related",
    "Open questions",
  ],
  "Source Summary": [
    "Summary",
    "Key points",
    "Entities and concepts",
    "Open questions",
  ],
  Entity: ["Overview", "Key facts", "Relationships", "Open questions"],
  "Raw Source": ["Capture notes", "Content"],
};

const BODY_SECTION: Readonly<Record<string, string>> = {
  Concept: "Definition",
  "Source Summary": "Summary",
  Entity: "Overview",
  "Raw Source": "Content",
};

export function scratchNote(title: string, capturedAt: string): string {
  return [
    "---",
    `title: ${yamlScalar(title)}`,
    `captured: ${yamlScalar(capturedAt)}`,
    "---",
    "",
    "",
  ].join("\n");
}

/**
 * Marp decks are not promoted into the bundle. Even a deck that already
 * satisfies the page contract stays put: promotion must not wrap slides.
 */
export function promoteRefusal(text: string): string | undefined {
  if (!isMarpDocument(text)) {
    return undefined;
  }
  if (pageContract(frontmatter(text)?.values).ok) {
    return "This Marp deck already has a page contract. Leave it where it is and link to it. It was not moved or wrapped.";
  }
  return "Scratch Marp decks stay outside the wiki. Move the deck outside the bundle and paste a Markdown link. It was not wrapped as a wiki page.";
}

export function promotePage(input: {
  readonly title: string;
  readonly type: string;
  readonly body: string;
  readonly at: string;
}): string {
  const sections = SECTIONS[input.type] ?? ["Notes"];
  const bodySection = BODY_SECTION[input.type] ?? sections[0] ?? "Notes";
  const lines = pageHeader(input.title, input.type, input.at);
  for (const section of sections) {
    lines.push(`## ${section}`, "");
    if (section === bodySection && input.body.trim() !== "") {
      lines.push(input.body.trim(), "");
    }
  }
  return `${lines.join("\n")}\n`;
}

export function promotedStub(title: string, link: string, at: string): string {
  const label = title.replaceAll("[", "").replaceAll("]", "");
  return [
    "---",
    `title: ${yamlScalar(title)}`,
    `promoted: ${yamlScalar(at)}`,
    "---",
    "",
    `Promoted to [${label}](${link}).`,
    "",
  ].join("\n");
}

export function scratchBody(text: string): string {
  const header = frontmatter(text);
  return (header ? text.slice(header.end) : text).trim();
}

export function destinationDirectory(
  layout: ResolvedLayout | undefined,
  logical: string,
): string {
  if (!layout) {
    return `knowledge/${logical}`;
  }
  const physical = layout.dirs[logical] ?? logical;
  return `${layout.bundle}/${physical}`;
}

export function scratchIsInsideBundle(
  layout: ResolvedLayout | undefined,
  folder: string,
): boolean {
  return layout ? isInsidePath(layout.bundle, folder) : false;
}

export function noteSlug(title: string): string {
  const ascii = asciiText(title.normalize("NFKD"));
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "note";
}

function asciiText(value: string): string {
  let ascii = "";
  for (const character of value) {
    if (character.charCodeAt(0) < 128) {
      ascii += character;
    }
  }
  return ascii;
}

function pageHeader(title: string, type: string, at: string): string[] {
  return [
    "---",
    `type: ${yamlScalar(type)}`,
    `title: ${yamlScalar(title)}`,
    `description: ${yamlScalar("Promoted from a scratch note.")}`,
    "tags: []",
    "generated:",
    `  by: ${yamlScalar("human:workbench")}`,
    `  at: ${yamlScalar(at)}`,
    "---",
    "",
    `# ${title}`,
    "",
  ];
}
