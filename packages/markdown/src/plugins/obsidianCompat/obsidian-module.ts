import * as cmAutocomplete from "@codemirror/autocomplete";
import * as cmCollab from "@codemirror/collab";
import * as cmCommands from "@codemirror/commands";
import * as cmLanguage from "@codemirror/language";
import * as cmSearch from "@codemirror/search";
import * as cmState from "@codemirror/state";
import * as cmView from "@codemirror/view";
import * as lezerCommon from "@lezer/common";
import * as lezerHighlight from "@lezer/highlight";
import * as lezerMarkdown from "@lezer/markdown";
import {
  createDiv,
  createEl,
  createFragment,
  createSpan,
  createSvg,
  installDomHelpers,
} from "./dom-helpers";
import {
  Editor,
  editorEditorField,
  editorInfoField,
  editorLivePreviewField,
  editorViewField,
  livePreviewState,
} from "./editor-bridge";
import {
  arrayBufferToBase64,
  arrayBufferToHex,
  apiVersion,
  base64ToArrayBuffer,
  Component,
  debounce,
  Events,
  getLanguage,
  hexToArrayBuffer,
  Keymap,
  MarkdownRenderChild,
  moment,
  normalizePath,
  parseYaml,
  Platform,
  requireApiVersion,
  Scope,
  stringifyYaml,
} from "./obsidian-core";
import {
  DataAdapter,
  FileSystemAdapter,
  TAbstractFile,
  TFile,
  TFolder,
  Vault,
} from "./obsidian-files";
import {
  FileManager,
  fuzzySearch,
  getAllTags,
  getFrontMatterInfo,
  getLinkpath,
  MetadataCache,
  parseFrontMatterAliases,
  parseFrontMatterEntry,
  parseFrontMatterStringArray,
  parseFrontMatterTags,
  parseLinktext,
  prepareFuzzySearch,
  prepareQuery,
  prepareSimpleSearch,
  renderMatches,
  renderResults,
  resolveSubpath,
  sortSearchResults,
  stripHeading,
  stripHeadingForLink,
} from "./obsidian-metadata";
import {
  AbstractInputSuggest,
  ConfirmationModal,
  EditorSuggest,
  FuzzySuggestModal,
  HoverPopover,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  Notice,
  PopoverSuggest,
  SuggestModal,
} from "./obsidian-modals";
import { Plugin } from "./obsidian-plugin";
import { installRuntimeEnv } from "./runtime-env";
import {
  AbstractTextComponent,
  addIcon,
  BaseComponent,
  ButtonComponent,
  ColorComponent,
  displayTooltip,
  DropdownComponent,
  ExtraButtonComponent,
  getIcon,
  getIconIds,
  htmlToMarkdown,
  MomentFormatComponent,
  PluginSettingTab,
  ProgressBarComponent,
  removeIcon,
  sanitizeHTMLToDom,
  SearchComponent,
  setIcon,
  setTooltip,
  Setting,
  SettingTab,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
  ValueComponent,
} from "./obsidian-ui";
import {
  App,
  EditableFileView,
  FileView,
  ItemView,
  MarkdownPreviewRenderer,
  MarkdownPreviewView,
  MarkdownRenderer,
  MarkdownView,
  TextFileView,
  View,
  Workspace,
  WorkspaceItem,
  WorkspaceLeaf,
  WorkspaceParent,
  WorkspaceRibbon,
  WorkspaceSidedock,
  WorkspaceSplit,
  WorkspaceTabs,
} from "./obsidian-workspace";

export const obsidianModule = Object.freeze({
  App,
  Component,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingTab,
  Modal,
  ConfirmationModal,
  SuggestModal,
  FuzzySuggestModal,
  Notice,
  Menu,
  MenuItem,
  MenuSeparator,
  Events,
  Scope,
  Keymap,
  Vault,
  DataAdapter,
  FileSystemAdapter,
  TAbstractFile,
  TFile,
  TFolder,
  MetadataCache,
  FileManager,
  Workspace,
  WorkspaceLeaf,
  WorkspaceItem,
  WorkspaceParent,
  WorkspaceSplit,
  WorkspaceTabs,
  WorkspaceSidedock,
  WorkspaceRibbon,
  View,
  ItemView,
  FileView,
  EditableFileView,
  TextFileView,
  MarkdownView,
  MarkdownPreviewView,
  MarkdownRenderer,
  MarkdownPreviewRenderer,
  MarkdownRenderChild,
  Editor,
  EditorSuggest,
  PopoverSuggest,
  AbstractInputSuggest,
  HoverPopover,
  BaseComponent,
  ValueComponent,
  ButtonComponent,
  ExtraButtonComponent,
  ToggleComponent,
  AbstractTextComponent,
  TextComponent,
  TextAreaComponent,
  SearchComponent,
  SliderComponent,
  DropdownComponent,
  ColorComponent,
  ProgressBarComponent,
  MomentFormatComponent,
  Platform,
  apiVersion,
  requireApiVersion,
  debounce,
  normalizePath,
  parseYaml,
  stringifyYaml,
  moment,
  getLanguage,
  setIcon,
  getIcon,
  addIcon,
  removeIcon,
  getIconIds,
  setTooltip,
  displayTooltip,
  sanitizeHTMLToDom,
  htmlToMarkdown,
  getAllTags,
  getFrontMatterInfo,
  parseFrontMatterAliases,
  parseFrontMatterEntry,
  parseFrontMatterStringArray,
  parseFrontMatterTags,
  parseLinktext,
  getLinkpath,
  resolveSubpath,
  stripHeading,
  stripHeadingForLink,
  prepareFuzzySearch,
  prepareSimpleSearch,
  prepareQuery,
  fuzzySearch,
  renderResults,
  renderMatches,
  sortSearchResults,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  arrayBufferToHex,
  hexToArrayBuffer,
  editorInfoField,
  editorViewField,
  editorEditorField,
  editorLivePreviewField,
  livePreviewState,
  createEl,
  createDiv,
  createSpan,
  createSvg,
  createFragment,
});

export type ObsidianModule = typeof obsidianModule;

const sharedModules: Readonly<Record<string, unknown>> = Object.freeze({
  obsidian: obsidianModule,
  "@codemirror/autocomplete": cmAutocomplete,
  "@codemirror/closebrackets": cmAutocomplete,
  "@codemirror/collab": cmCollab,
  "@codemirror/commands": cmCommands,
  "@codemirror/comment": cmCommands,
  "@codemirror/history": cmCommands,
  "@codemirror/language": cmLanguage,
  "@codemirror/fold": cmLanguage,
  "@codemirror/highlight": cmLanguage,
  "@codemirror/matchbrackets": cmLanguage,
  "@codemirror/stream-parser": cmLanguage,
  "@codemirror/search": cmSearch,
  "@codemirror/state": cmState,
  "@codemirror/text": cmState,
  "@codemirror/rangeset": cmState,
  "@codemirror/view": cmView,
  "@codemirror/gutter": cmView,
  "@codemirror/panel": cmView,
  "@codemirror/rectangular-selection": cmView,
  "@codemirror/tooltip": cmView,
  "@lezer/common": lezerCommon,
  "@lezer/highlight": lezerHighlight,
  "@lezer/markdown": lezerMarkdown,
});

export type PluginRequire = (moduleId: string) => unknown;

export function createPluginRequire(
  overrides?: Readonly<Record<string, unknown>>,
): PluginRequire {
  return (moduleId: string): unknown => {
    if (overrides && Object.hasOwn(overrides, moduleId)) {
      return overrides[moduleId];
    }
    if (Object.hasOwn(sharedModules, moduleId)) {
      return sharedModules[moduleId];
    }
    throw new Error(
      `Cannot find module '${moduleId}' in Lumière's Obsidian plugin runtime.`,
    );
  };
}

export function installObsidianGlobalModule(
  targetGlobal: Record<PropertyKey, unknown> = globalThis,
): PluginRequire {
  installDomHelpers(targetGlobal);
  installRuntimeEnv(targetGlobal);
  const req = createPluginRequire();
  targetGlobal.obsidian = obsidianModule;
  targetGlobal.moment = moment;
  const previousRequire =
    typeof targetGlobal.require === "function"
      ? (targetGlobal.require as PluginRequire)
      : undefined;
  targetGlobal.require = (moduleId: string): unknown => {
    if (Object.hasOwn(sharedModules, moduleId)) {
      return req(moduleId);
    }
    if (previousRequire) {
      return previousRequire(moduleId);
    }
    return req(moduleId);
  };
  return req;
}

export {
  App,
  Component,
  createDiv,
  createEl,
  createFragment,
  createSpan,
  createSvg,
  DataAdapter,
  debounce,
  Editor,
  Events,
  FileManager,
  FileSystemAdapter,
  getAllTags,
  getLanguage,
  installDomHelpers,
  Keymap,
  MarkdownRenderChild,
  MarkdownRenderer,
  MarkdownView,
  Menu,
  MetadataCache,
  Modal,
  Notice,
  normalizePath,
  parseFrontMatterAliases,
  parseFrontMatterTags,
  parseYaml,
  Platform,
  Plugin,
  PluginSettingTab,
  requireApiVersion,
  resolveSubpath,
  Scope,
  Setting,
  SettingTab,
  stringifyYaml,
  TAbstractFile,
  TFile,
  TFolder,
  Vault,
  Workspace,
  WorkspaceLeaf,
};
