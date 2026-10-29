import {
  DEFAULT_TOOLBAR_SETTINGS,
  type ToolbarSettings,
} from "../../shared/toolbar-settings";
import type { ViewState } from "../../shared/view-state";
import { Emitter, type Event, type Subscription } from "../events";
import type { PdfViewerPanel, PluginMessage } from "./panel";

/** The viewer's custom editor id, in every host. */
export const VIEW_TYPE = "lumiere.pdf.viewer";

type Handler<P, T extends PluginMessage["type"]> = (
  panel: P,
  message: Extract<PluginMessage, { type: T }>,
) => unknown;
type AnyHandler<P> = (panel: P, message: PluginMessage) => unknown;

/** What the host tells the registry about one panel's page. */
export interface PanelLifecycle {
  /** The page was shown, hidden, focused or left. */
  readonly onState: Event<void>;
  /** The page closed. */
  readonly onDispose: Event<void>;
}

/**
 * All open PDF editors, and the one the reader is in: the `panels` service
 * the other plugins build on. Commands and the outline view act on the
 * active one. Which one is active is the host's to say (`findActive`).
 *
 * Invariants:
 *
 * - Panels are tracked individually, never by path, so the same PDF open in
 *   two editor groups keeps two independent selections.
 * - Each viewer message type a plugin handles has exactly one handler; with
 *   its plugin stopped, the message is ignored.
 */
export abstract class PdfViewerPanels<P extends PdfViewerPanel> {
  private readonly panels = new Set<P>();
  private readonly panelSubscriptions = new Map<P, Subscription[]>();
  private current: P | undefined;
  private readonly changed = new Emitter<void>();
  /** Fires when the active panel changes, or its outline, selection or view does. */
  readonly onDidChange = this.changed.event;
  private readonly opened = new Emitter<P>();
  /** Fires when an editor opens. */
  readonly onDidOpen = this.opened.event;
  private readonly handlers = new Map<PluginMessage["type"], AnyHandler<P>>();
  private toolbar: () => ToolbarSettings = () => DEFAULT_TOOLBAR_SETTINGS;

  /** `setContext`: the context keys menus and keybindings read, `lumiere.pdf.*`. */
  constructor(
    private readonly setContext: (key: string, value: unknown) => void,
  ) {}

  get active(): P | undefined {
    return this.current;
  }

  /** Every open PDF editor. */
  get all(): readonly P[] {
    return [...this.panels];
  }

  /** Handle a viewer message type (for as long as the returned subscription lives). */
  handle<T extends PluginMessage["type"]>(
    type: T,
    handler: Handler<P, T>,
  ): Subscription {
    if (this.handlers.has(type)) {
      throw new Error(`A plugin already handles ${type} messages`);
    }
    const entry = handler as AnyHandler<P>;
    this.handlers.set(type, entry);
    return {
      dispose: () => {
        if (this.handlers.get(type) === entry) {
          this.handlers.delete(type);
        }
      },
    };
  }

  async route(panel: P, message: PluginMessage): Promise<void> {
    await this.handlers.get(message.type)?.(panel, message);
  }

  /** Where the toolbar plugin says new viewers put their controls. */
  provideViewerToolbar(settings: () => ToolbarSettings): Subscription {
    this.toolbar = settings;
    return {
      dispose: () => {
        if (this.toolbar === settings) {
          this.toolbar = () => DEFAULT_TOOLBAR_SETTINGS;
        }
      },
    };
  }

  viewerToolbar(): ToolbarSettings {
    return this.toolbar();
  }

  /**
   * Stop tracking every editor. The pages themselves belong to the host and
   * stay open; they no longer talk to the plugins.
   */
  dispose(): void {
    for (const panel of [...this.panels]) {
      this.forget(panel);
    }
    this.changed.dispose();
    this.opened.dispose();
    this.handlers.clear();
  }

  /** The panel the reader is in, as the host sees it; called whenever that may have changed. */
  protected abstract findActive(panels: ReadonlySet<P>): P | undefined;

  /** A new editor: track it until its page closes. */
  protected track(panel: P, lifecycle: PanelLifecycle): void {
    this.panels.add(panel);
    this.panelSubscriptions.set(panel, [
      lifecycle.onState(() => this.update()),
      panel.onDidChange(() => {
        if (panel === this.current) {
          this.publish();
        }
      }),
      lifecycle.onDispose(() => {
        this.forget(panel);
        this.update();
      }),
    ]);
    this.opened.fire(panel);
    this.update();
  }

  /** Recompute the active panel and tell the plugins if it changed. */
  protected update(): void {
    const next = this.findActive(this.panels);
    if (next === this.current) {
      return;
    }
    this.current = next;
    this.publish();
  }

  private forget(panel: P): void {
    for (const subscription of this.panelSubscriptions.get(panel) ?? []) {
      subscription.dispose();
    }
    this.panelSubscriptions.delete(panel);
    this.panels.delete(panel);
    panel.dispose();
    if (this.current === panel) {
      this.current = undefined;
    }
  }

  private publish(): void {
    for (const [key, value] of Object.entries(contextKeys(this.current))) {
      this.setContext(`lumiere.pdf.${key}`, value);
    }
    this.changed.fire();
  }
}

/**
 * The context keys menus and keybindings read for the active PDF; for the
 * editor title actions, which fit and tool buttons to show, and whether there
 * is a page to go back or forward to.
 */
function contextKeys(
  panel: PdfViewerPanel | undefined,
): Record<string, unknown> {
  const view = panel?.view;
  return {
    pdfActive: Boolean(panel),
    hasSelection: Boolean(panel?.selection),
    outlineLoading: Boolean(panel && !panel.outline),
    ...(view ? viewKeys(view) : NO_VIEW),
  };
}

const NO_VIEW = {
  fit: "",
  tool: "text",
  pageLayout: "single",
  scrollMode: "continuous",
  scrollDirection: "vertical",
  canGoBack: false,
  canGoForward: false,
};

function viewKeys(view: ViewState): typeof NO_VIEW {
  return {
    fit: view.fit ?? "",
    tool: view.tool,
    pageLayout: view.pageLayout,
    scrollMode: view.scrollMode,
    scrollDirection: view.scrollDirection,
    canGoBack: view.canGoBack,
    canGoForward: view.canGoForward,
  };
}
