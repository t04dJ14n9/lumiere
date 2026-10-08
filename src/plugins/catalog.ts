import inlineTitle from "./inlineTitle/manifest";
import tags from "./tags/manifest";
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
import backlinks from "./backlinks/manifest";
import outgoingLinks from "./outgoingLinks/manifest";
import outline from "./outline/manifest";
import quickSwitcher from "./quickSwitcher/manifest";
import wordCount from "./wordCount/manifest";
import linkUpdates from "./linkUpdates/manifest";
export const features: readonly Manifest[] = [
  // Table navigation claims override keys before Vim.
  tables,
  properties,
  inlineTitle,
  pagePreview,
  embeds,
  tasks,
  footnotes,
  callouts,
  diagrams,
  math,
  codeBlocks,
  links,
  tags,
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

/**
 * Window-level feature plugins: native views, the status bar and commands
 * that work without an open editor. They have no editor half, so the editor
 * feature switch and composition tests (which iterate `features`) skip them.
 */
export const workbenchFeatures: readonly Manifest[] = [
  backlinks,
  outgoingLinks,
  outline,
  quickSwitcher,
  wordCount,
  linkUpdates,
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
  ...workbenchFeatures.map((item) => item.id),
];
export function pluginRank(owner: string): number {
  const index = owners.indexOf(owner);
  return index < 0 ? owners.length : index;
}
