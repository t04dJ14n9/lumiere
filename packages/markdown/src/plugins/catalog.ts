import { unavailableSettings, unavailableSwitches } from "../shared/host-needs";
import publicApi from "./publicApi/manifest";
import document from "./document/manifest";
import editor from "./editor/manifest";
import dialect from "./dialect/manifest";
import commands from "./commands/manifest";
import livePreview from "./livePreview/manifest";
import render from "./render/manifest";
import resources from "./resources/manifest";
import vault from "./vault/manifest";
import markers from "./markers/manifest";
import type { HostNeed } from "../shared/manifest";
import agentBridge from "./agentBridge/manifest";
import ideContext from "./ideContext/manifest";
import cursorBridge from "./cursorBridge/manifest";
import pasteHtml from "./pasteHtml/manifest";
import search from "./search/manifest";
import suggest from "./suggest/manifest";
import inlineTitle from "./inlineTitle/manifest";
import tags from "./tags/manifest";
import tables from "./tables/manifest";
import properties from "./properties/manifest";
import pagePreview from "./pagePreview/manifest";
import embeds from "./embeds/manifest";
import sketch from "./sketch/manifest";
import onlineVideos from "./onlineVideos/manifest";
import tasks from "./tasks/manifest";
import footnotes from "./footnotes/manifest";
import callouts from "./callouts/manifest";
import diagrams from "./diagrams/manifest";
import math from "./math/manifest";
import codeBlocks from "./codeBlocks/manifest";
import links from "./links/manifest";
import formatting from "./formatting/manifest";
import type { Manifest } from "../shared/manifest";
import {
  FEATURE_ORDER,
  WORKBENCH_FEATURE_ORDER,
  inPluginOrder,
} from "./plugin-order";
import folding from "./folding/manifest";
import lineNumbers from "./lineNumbers/manifest";
import gitGutter from "./gitGutter/manifest";
import gitInline from "./gitInline/manifest";
import gitBlame from "./gitBlame/manifest";
import indentGuides from "./indentGuides/manifest";
import stickyScroll from "./stickyScroll/manifest";
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
import bridge from "./bridge/manifest";
import wiki from "./wiki/manifest";
import attachments from "./attachments/manifest";
import scratch from "./scratch/manifest";
import gitDiffEditor from "./gitDiffEditor/manifest";
import marp from "./marp/manifest";
import okfCore from "./okfCore/manifest";
import obsidianCompat from "./obsidianCompat/manifest";
import graph from "./graph/manifest";
/**
 * Which plugins exist; nothing else. Their precedence is plugin-order.ts,
 * their dependencies plugin-graph.ts, and their lifecycle the kernel.
 */
export const features: readonly Manifest[] = inPluginOrder(
  [
    autoPair,
    callouts,
    codeBlocks,
    agentBridge,
    cursorBridge,
    diagrams,
    embeds,
    sketch,
    folding,
    footnotes,
    formatting,
    gitGutter,
    gitInline,
    gitBlame,
    indentGuides,
    stickyScroll,
    inlineTitle,
    lineNumbers,
    links,
    math,
    onlineVideos,
    pagePreview,
    pasteHtml,
    attachments,
    properties,
    search,
    smartLists,
    spellcheck,
    suggest,
    tables,
    tags,
    tasks,
    vim,
  ],
  FEATURE_ORDER,
);

/**
 * Window-level feature plugins: native views, the status bar and commands
 * that work without an open editor. They have no editor half, so the editor
 * feature switch and composition tests (which iterate `features`) skip them.
 */
export const workbenchFeatures: readonly Manifest[] = inPluginOrder(
  [
    backlinks,
    bridge,
    ideContext,
    gitDiffEditor,
    linkUpdates,
    marp,
    outgoingLinks,
    outline,
    quickSwitcher,
    scratch,
    wiki,
    wordCount,
    okfCore,
    obsidianCompat,
    graph,
  ],
  WORKBENCH_FEATURE_ORDER,
);

export { pluginRank } from "./plugin-order";

/** The core plugins: always on, in every host. */
export const coreManifests: readonly Manifest[] = [
  publicApi,
  document,
  editor,
  dialect,
  commands,
  livePreview,
  render,
  resources,
  vault,
  markers,
];

/** Every plugin's manifest: the core, then the features. */
export function allManifests(): readonly Manifest[] {
  return [...coreManifests, ...features, ...workbenchFeatures];
}

/** The settings a host offering `offered` should not show (shared/host-needs.ts). */
export function settingsUnavailableIn(
  offered: readonly HostNeed[],
): ReadonlySet<string> {
  return unavailableSettings(allManifests(), offered);
}

/** The switches of the plugins a host offering `offered` keeps off (shared/host-needs.ts). */
export function switchesUnavailableIn(
  offered: readonly HostNeed[],
): ReadonlySet<string> {
  return unavailableSwitches(allManifests(), offered);
}

/** Each plugin's title by its id ("lineNumbers" → "Line Numbers"), for settings pages. */
export function pluginTitles(): ReadonlyMap<string, string> {
  return new Map(
    allManifests().map((manifest) => [manifest.id, manifest.title]),
  );
}
