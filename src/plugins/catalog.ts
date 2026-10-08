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
  callouts,
  diagrams,
  math,
  codeBlocks,
  links,
  formatting,
  folding,
  lineNumbers,
  indentGuides,
  spellcheck,
  autoPair,
  smartLists,
  vim,
];
