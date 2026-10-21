/**
 * VS Code gives a webview its theme as `--vscode-*` CSS variables; Lumière's
 * styles read those. In DSH they come from DSH's own theme tokens
 * (`--dsw-alias-*`), so a note follows DSH's light and dark themes.
 */

/** The DSH token (after `--dsw-alias-`) each VS Code variable takes its value from. */
const FROM_TOKEN: Readonly<Record<string, string>> = {
  "badge-background": "interactive-bg-active",
  "badge-foreground": "label-primary",
  "button-background": "button-primary-fill",
  "button-border": "border-l2",
  "button-foreground": "label-primary-inverted",
  "button-hoverBackground": "button-primary-hover",
  "button-secondaryBackground": "interactive-bg-active",
  "button-secondaryForeground": "label-primary",
  "button-secondaryHoverBackground": "interactive-bg-hover",
  descriptionForeground: "label-secondary",
  "editor-background": "bg-base",
  "editor-foreground": "label-primary",
  "editor-selectionBackground": "bg-document-selection",
  "editorCodeLens-foreground": "label-tertiary",
  "editorCursor-foreground": "label-primary",
  "editorGutter-foldingControlForeground": "label-tertiary",
  "editorHoverWidget-background": "bg-layer-2",
  "editorHoverWidget-border": "border-l2",
  "editorHoverWidget-foreground": "label-primary",
  "editorIndentGuide-activeBackground1": "label-tertiary",
  "editorIndentGuide-background1": "border-l2",
  "editorLineNumber-activeForeground": "label-secondary",
  "editorLineNumber-foreground": "label-tertiary",
  "editorStickyScroll-border": "border-l2",
  "editorStickyScroll-shadow": "border-l2",
  "editorStickyScrollHover-background": "interactive-bg-hover",
  "editorSuggestWidget-background": "bg-layer-2",
  "editorSuggestWidget-border": "border-l2",
  "editorSuggestWidget-foreground": "label-primary",
  "editorSuggestWidget-selectedForeground": "label-primary",
  "editorWidget-background": "bg-layer-2",
  "editorWidget-border": "border-l2",
  "editorWidget-foreground": "label-primary",
  errorForeground: "state-error-primary",
  focusBorder: "link",
  foreground: "label-primary",
  "gitDecoration-addedResourceForeground": "state-success-primary",
  "gitDecoration-deletedResourceForeground": "state-error-primary",
  "gitDecoration-modifiedResourceForeground": "state-warn-primary",
  "input-background": "bg-layer-1",
  "input-border": "border-l2",
  "input-foreground": "label-primary",
  "inputOption-activeForeground": "label-primary",
  "inputValidation-errorBorder": "state-error-primary",
  "list-activeSelectionBackground": "interactive-bg-active",
  "list-activeSelectionForeground": "label-primary",
  "list-hoverBackground": "interactive-bg-hover",
  "list-warningForeground": "state-warn-primary",
  "menu-background": "bg-layer-2",
  "menu-border": "border-l2",
  "menu-foreground": "label-primary",
  "menu-selectionBackground": "interactive-bg-active",
  "menu-selectionForeground": "label-primary",
  "panel-border": "border-l2",
  "textCodeBlock-background": "interactive-bg-hover",
  "textLink-activeForeground": "link",
  "textLink-foreground": "link",
  "textPreformat-foreground": "label-primary",
  "toolbar-hoverBackground": "interactive-bg-hover",
  "widget-border": "border-l2",
  "widget-shadow": "border-l2",
};

/** Colours DSH has no token for: VS Code's default light and dark themes' values. */
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
    "symbolIcon-functionForeground": "#b180d7",
    "symbolIcon-keywordForeground": "#cccccc",
    "symbolIcon-propertyForeground": "#cccccc",
    "symbolIcon-variableForeground": "#75beff",
  },
};

const MONOSPACE = `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

export interface DshTheme {
  /** A DSH token's value (name after `--dsw-alias-`), or "" when unset. */
  token(name: string): string;
  readonly dark: boolean;
  readonly fontFamily: string;
}

/** Every `--vscode-*` variable, with its value under DSH's current theme. */
export function vscodeVariables(theme: DshTheme): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, token] of Object.entries(FROM_TOKEN)) {
    const value = theme.token(token);
    if (value) {
      variables[`--vscode-${name}`] = value;
    }
  }
  for (const [name, value] of Object.entries(
    FIXED[theme.dark ? "dark" : "light"],
  )) {
    variables[`--vscode-${name}`] = value;
  }
  variables["--vscode-font-family"] = theme.fontFamily;
  variables["--vscode-editor-font-family"] = MONOSPACE;
  variables["--vscode-font-size"] = "13px";
  variables["--vscode-editor-font-size"] = "14px";
  return variables;
}
