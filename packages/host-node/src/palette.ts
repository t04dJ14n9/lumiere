/**
 * An embedder's theme as a few colour roles, and the `--vscode-*` variables
 * Lumière's editor reads, derived from them. VS Code sets those variables
 * on a webview; elsewhere the embedder fills a palette from its own theme
 * (DSH from its tokens, the app shell from its light and dark palettes) and
 * sends `themeMessage(palette)` to each page (embedding.ts).
 */
import type { ThemeMessage } from "./embedding";

export interface Palette {
  readonly dark: boolean;
  readonly fontFamily: string;
  /** The editor's page. */
  readonly background: string;
  /** Hovers, menus, suggestions and other widgets over the page. */
  readonly surface: string;
  /** Text fields. */
  readonly field: string;
  readonly foreground: string;
  /** Secondary text: descriptions, the current line number. */
  readonly muted: string;
  /** Tertiary text: line numbers, fold controls, guides. */
  readonly faint: string;
  readonly border: string;
  /** Links and focus rings. */
  readonly accent: string;
  /** Under the pointer in lists and toolbars. */
  readonly hover: string;
  /** Selected in lists and menus. */
  readonly active: string;
  /** Selected text in the editor. */
  readonly selection: string;
  readonly button: string;
  readonly buttonForeground: string;
  readonly buttonHover: string;
  readonly error: string;
  readonly warning: string;
  readonly success: string;
}

type Role = Exclude<keyof Palette, "dark" | "fontFamily">;

/** The palette role each VS Code variable takes its value from. */
const FROM_ROLE: Readonly<Record<string, Role>> = {
  "badge-background": "active",
  "badge-foreground": "foreground",
  "button-background": "button",
  "button-border": "border",
  "button-foreground": "buttonForeground",
  "button-hoverBackground": "buttonHover",
  "button-secondaryBackground": "active",
  "button-secondaryForeground": "foreground",
  "button-secondaryHoverBackground": "hover",
  descriptionForeground: "muted",
  "editor-background": "background",
  "editor-foreground": "foreground",
  "editor-selectionBackground": "selection",
  "editorCodeLens-foreground": "faint",
  "editorCursor-foreground": "foreground",
  "editorGutter-foldingControlForeground": "faint",
  "editorHoverWidget-background": "surface",
  "editorHoverWidget-border": "border",
  "editorHoverWidget-foreground": "foreground",
  "editorIndentGuide-activeBackground1": "faint",
  "editorIndentGuide-background1": "border",
  "editorLineNumber-activeForeground": "muted",
  "editorLineNumber-foreground": "faint",
  "editorStickyScroll-border": "border",
  "editorStickyScroll-shadow": "border",
  "editorStickyScrollHover-background": "hover",
  "editorSuggestWidget-background": "surface",
  "editorSuggestWidget-border": "border",
  "editorSuggestWidget-foreground": "foreground",
  "editorSuggestWidget-selectedForeground": "foreground",
  "editorWidget-background": "surface",
  "editorWidget-border": "border",
  "editorWidget-foreground": "foreground",
  errorForeground: "error",
  focusBorder: "accent",
  foreground: "foreground",
  "gitDecoration-addedResourceForeground": "success",
  "gitDecoration-deletedResourceForeground": "error",
  "gitDecoration-modifiedResourceForeground": "warning",
  "input-background": "field",
  "input-border": "border",
  "input-foreground": "foreground",
  "inputOption-activeForeground": "foreground",
  "inputValidation-errorBorder": "error",
  "list-activeSelectionBackground": "active",
  "list-activeSelectionForeground": "foreground",
  "list-hoverBackground": "hover",
  "list-warningForeground": "warning",
  "menu-background": "surface",
  "menu-border": "border",
  "menu-foreground": "foreground",
  "menu-selectionBackground": "active",
  "menu-selectionForeground": "foreground",
  "panel-border": "border",
  "textCodeBlock-background": "hover",
  "textLink-activeForeground": "accent",
  "textLink-foreground": "accent",
  "textPreformat-foreground": "foreground",
  "toolbar-hoverBackground": "hover",
  "widget-border": "border",
  "widget-shadow": "border",
};

/** Colours no palette role covers: VS Code's default light and dark themes' values. */
const FIXED: Readonly<
  Record<"light" | "dark", Readonly<Record<string, string>>>
> = {
  light: {
    "charts-blue": "#1a85ff",
    "charts-green": "#388a34",
    "charts-orange": "#d18616",
    "charts-purple": "#652d90",
    "charts-red": "#e51400",
    "charts-yellow": "#bf8803",
    "debugTokenExpression-number": "#098658",
    "debugTokenExpression-string": "#a31515",
    "editor-findMatchBackground": "#a8ac94",
    "editor-findMatchHighlightBackground": "#ea5c0055",
    // GitLens trailing-line blame: gray #999999 at about 35% alpha.
    "gitlens-trailingLineForegroundColor": "#99999959",
    "scrollbarSlider-background": "#64646466",
    "scrollbarSlider-hoverBackground": "#646464b3",
    "symbolIcon-functionForeground": "#652d90",
    "symbolIcon-keywordForeground": "#616161",
    "symbolIcon-propertyForeground": "#616161",
    "symbolIcon-variableForeground": "#007acc",
  },
  dark: {
    "charts-blue": "#3794ff",
    "charts-green": "#89d185",
    "charts-orange": "#d18616",
    "charts-purple": "#b180d7",
    "charts-red": "#f14c4c",
    "charts-yellow": "#cca700",
    "debugTokenExpression-number": "#b5cea8",
    "debugTokenExpression-string": "#ce9178",
    "editor-findMatchBackground": "#515c6a",
    "editor-findMatchHighlightBackground": "#ea5c0055",
    // GitLens trailing-line blame: gray #999999 at about 35% alpha.
    "gitlens-trailingLineForegroundColor": "#99999959",
    "scrollbarSlider-background": "#79797966",
    "scrollbarSlider-hoverBackground": "#646464b3",
    "symbolIcon-functionForeground": "#b180d7",
    "symbolIcon-keywordForeground": "#cccccc",
    "symbolIcon-propertyForeground": "#cccccc",
    "symbolIcon-variableForeground": "#75beff",
  },
};

const MONOSPACE = `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

/** Every `--vscode-*` variable the editor reads, under this palette. */
export function vscodeVariables(palette: Palette): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, role] of Object.entries(FROM_ROLE)) {
    const value = palette[role];
    if (value) {
      variables[`--vscode-${name}`] = value;
    }
  }
  for (const [name, value] of Object.entries(
    FIXED[palette.dark ? "dark" : "light"],
  )) {
    variables[`--vscode-${name}`] = value;
  }
  variables["--vscode-font-family"] = palette.fontFamily;
  variables["--vscode-editor-font-family"] = MONOSPACE;
  variables["--vscode-font-size"] = "13px";
  variables["--vscode-editor-font-size"] = "14px";
  return variables;
}

export function themeMessage(palette: Palette): ThemeMessage {
  return {
    lumiere: "theme",
    dark: palette.dark,
    variables: vscodeVariables(palette),
  };
}
