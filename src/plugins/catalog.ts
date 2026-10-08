import tables from "./tables/manifest";
import properties from "./properties/manifest";
import pagePreview from "./pagePreview/manifest";
import embeds from "./embeds/manifest";
import tasks from "./tasks/manifest";
import footnotes from "./footnotes/manifest";
import callouts from "./callouts/manifest";
import diagrams from "./diagrams/manifest";
import math from "./math/manifest";
import codeBlocks from "./codeBlocks/manifest";
import links from "./links/manifest";
import formatting from "./formatting/manifest";
import type { Manifest } from "../shared/manifest";
import folding from "./folding/manifest";
import lineNumbers from "./lineNumbers/manifest";
import indentGuides from "./indentGuides/manifest";
import spellcheck from "./spellcheck/manifest";
import autoPair from "./autoPair/manifest";
import smartLists from "./smartLists/manifest";
import vim from "./vim/manifest";
export const features: readonly Manifest[] = [
  // Table navigation claims override keys before Vim.
  tables,
  properties,
  pagePreview,
  embeds,
  tasks,
  footnotes,
  callouts,
  diagrams,
  math,
  codeBlocks,
  links,
  formatting,
  // Match VS Code: line numbers to the left of fold markers.
  lineNumbers,
  folding,
  indentGuides,
  spellcheck,
  autoPair,
  smartLists,
  vim,
];

// Core rank is independent of activation order and shared by both runtimes.
const owners = [
  "document",
  "editor",
  "dialect",
  "commands",
  "vault",
  "resources",
  "render",
  "livePreview",
  "markers",
  ...features.map((item) => item.id),
];
export function pluginRank(owner: string): number {
  const index = owners.indexOf(owner);
  return index < 0 ? owners.length : index;
}
