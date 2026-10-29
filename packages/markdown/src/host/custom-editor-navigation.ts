import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { Disposer } from "@workshop/core";
import type { PanelShell } from "../shared/host";
import { SourceCoordinates } from "../shared/document/coordinates";
import type { NativeNavigation, OffsetRevealTarget } from "./navigation";

export interface ViewStateHandlers {
  capture(): Promise<unknown>;
  restore(state: unknown): Promise<void>;
}

export interface PanelBinding {
  id: string;
  document: vscode.TextDocument;
  selection: vscode.Selection | undefined;
  readonly selectionListeners: Set<
    (value: vscode.Selection | undefined) => unknown
  >;
  readonly shellDisposeListeners: Set<() => void>;
  viewState?: ViewStateHandlers | undefined;
  pendingRestore?: unknown;
}

const CUSTOM_EDITOR_PROPOSALS = [
  "customTextEditorNavigation",
  "customEditorMove",
] as const;

const panelBindings = new WeakMap<vscode.WebviewPanel, PanelBinding>();

export function bindingForPanel(
  panel: vscode.WebviewPanel,
  document?: vscode.TextDocument,
): PanelBinding {
  let binding = panelBindings.get(panel);
  if (!binding) {
    binding = {
      id: randomUUID(),
      document: document!,
      selection: undefined,
      selectionListeners: new Set(),
      shellDisposeListeners: new Set(),
    };
    panelBindings.set(panel, binding);
    const stop = panel.onDidDispose(() => {
      stop.dispose();
      for (const listener of [...(binding?.shellDisposeListeners ?? [])]) {
        listener();
      }
      panelBindings.delete(panel);
    });
  } else if (document) {
    binding.document = document;
  }
  return binding;
}

function addApiProposal(target: unknown, proposal: string): void {
  if (!target || typeof target !== "object") {
    return;
  }
  const record = target as { enabledApiProposals?: unknown };
  const current = Array.isArray(record.enabledApiProposals)
    ? record.enabledApiProposals.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  if (!current.includes(proposal)) {
    try {
      record.enabledApiProposals = [...current, proposal];
    } catch {
      // Ignore frozen test fixtures.
    }
  }
}

export function enableCustomTextEditorProposals(extension: unknown): void {
  for (const proposal of CUSTOM_EDITOR_PROPOSALS) {
    addApiProposal(extension, proposal);
    if (
      extension &&
      typeof extension === "object" &&
      "packageJSON" in extension
    ) {
      addApiProposal(
        (extension as { packageJSON?: unknown }).packageJSON,
        proposal,
      );
    }
  }
}

function subscribeSelection(
  binding: PanelBinding,
  listener: (value: vscode.Selection | undefined) => unknown,
  thisArgs?: unknown,
  disposables?: {
    push?(d: { dispose(): void }): unknown;
    add?(d: { dispose(): void }): unknown;
  },
): { dispose(): void } {
  const bound = thisArgs ? listener.bind(thisArgs) : listener;
  binding.selectionListeners.add(bound);
  const subscription = {
    dispose: () => binding.selectionListeners.delete(bound),
  };
  if (Array.isArray(disposables)) {
    disposables.push(subscription);
  } else if (disposables && typeof disposables.add === "function") {
    disposables.add(subscription);
  }
  return subscription;
}

function toVscodeSelection(
  document: vscode.TextDocument,
  anchor: number,
  head: number,
): vscode.Selection {
  const coordinates = new SourceCoordinates(document.getText());
  const anchorPos = document.positionAt(coordinates.toSource(anchor));
  const activePos = document.positionAt(coordinates.toSource(head));
  const SelectionCtor =
    (vscode as { Selection?: typeof vscode.Selection }).Selection ??
    (vscode.Range as unknown as typeof vscode.Selection);
  return new SelectionCtor(anchorPos, activePos);
}

function sameSelection(
  a: vscode.Selection | undefined,
  b: vscode.Selection | undefined,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  const aAnchor = (a as { anchor?: vscode.Position }).anchor ?? a.start;
  const aActive = (a as { active?: vscode.Position }).active ?? a.end;
  const bAnchor = (b as { anchor?: vscode.Position }).anchor ?? b.start;
  const bActive = (b as { active?: vscode.Position }).active ?? b.end;
  return (
    aAnchor.line === bAnchor.line &&
    aAnchor.character === bAnchor.character &&
    aActive.line === bActive.line &&
    aActive.character === bActive.character
  );
}

function resolveRevealTarget(
  document: vscode.TextDocument,
  range: vscode.Range,
  options?: {
    selection?: vscode.Range | vscode.Selection;
    preserveFocus?: boolean;
  },
): OffsetRevealTarget {
  const coordinates = new SourceCoordinates(document.getText());
  const selectionRange = options?.selection;
  const startPos = selectionRange ? selectionRange.start : range.start;
  const endPos = selectionRange ? selectionRange.end : range.start;
  const at = coordinates.toEditor(document.offsetAt(startPos));
  const endOffset = coordinates.toEditor(document.offsetAt(endPos));
  const to = endOffset > at ? endOffset : undefined;
  const preserveFocus = options?.preserveFocus ? true : undefined;
  return to !== undefined || preserveFocus
    ? {
        at,
        ...(to !== undefined ? { to } : {}),
        ...(preserveFocus ? { preserveFocus: true } : {}),
      }
    : at;
}

async function deliverNavigationRange(
  binding: PanelBinding,
  panel: vscode.WebviewPanel,
  navigation: NativeNavigation | undefined,
  args: {
    range: vscode.Range;
    options?: {
      selection?: vscode.Range | vscode.Selection;
      preserveFocus?: boolean;
    };
    token?: vscode.CancellationToken;
  },
): Promise<void> {
  const { range, options, token } = args;
  if (!navigation || token?.isCancellationRequested) {
    return;
  }
  const target = resolveRevealTarget(binding.document, range, options);
  const intent = navigation.begin();
  const cancel = token?.onCancellationRequested?.(() => intent.token.cancel());
  try {
    if (navigation.revealPanel) {
      await navigation.revealPanel(binding.id, target, intent);
    } else {
      await navigation.revealOpened(
        binding.document.uri.toString(),
        panel.viewColumn ?? 1,
        target,
        intent,
      );
    }
  } finally {
    cancel?.dispose?.();
  }
}

export function createCustomEditorNavigation(
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
  navigation: NativeNavigation | undefined,
) {
  const binding = bindingForPanel(panel, document);
  return {
    get selection() {
      return binding.selection;
    },
    onDidChangeSelection: (
      listener: (value: vscode.Selection | undefined) => unknown,
      thisArgs?: unknown,
      disposables?: {
        push?(d: { dispose(): void }): unknown;
        add?(d: { dispose(): void }): unknown;
      },
    ) => subscribeSelection(binding, listener, thisArgs, disposables),
    revealRange: (
      range: vscode.Range,
      options?: {
        selection?: vscode.Range | vscode.Selection;
        preserveFocus?: boolean;
      },
      token?: vscode.CancellationToken,
    ) =>
      deliverNavigationRange(binding, panel, navigation, {
        range,
        ...(options ? { options } : {}),
        ...(token ? { token } : {}),
      }),
    async captureViewState(): Promise<unknown> {
      try {
        return await binding.viewState?.capture();
      } catch {
        return undefined;
      }
    },
    async restoreViewState(
      state: unknown,
      token?: vscode.CancellationToken,
    ): Promise<void> {
      if (!state || token?.isCancellationRequested) {
        return;
      }
      try {
        await binding.viewState?.restore(state);
      } catch {
        // Ignore if the panel closed or replaced while previewing.
      }
    },
    dispose(): void {},
  };
}

export function bindShellState(
  binding: PanelBinding,
): Pick<PanelShell, "reportSelection" | "bindViewState"> {
  return {
    reportSelection({ anchor, head }) {
      const next = toVscodeSelection(binding.document, anchor, head);
      if (!sameSelection(binding.selection, next)) {
        binding.selection = next;
        for (const listener of binding.selectionListeners) {
          listener(next);
        }
      }
    },
    bindViewState(handlers): Disposer {
      binding.viewState = handlers;
      if (binding.pendingRestore !== undefined) {
        const snapshot = binding.pendingRestore;
        binding.pendingRestore = undefined;
        void handlers.restore(snapshot).catch(() => {});
      }
      return () => {
        if (binding.viewState === handlers) {
          binding.viewState = undefined;
        }
      };
    },
  };
}
