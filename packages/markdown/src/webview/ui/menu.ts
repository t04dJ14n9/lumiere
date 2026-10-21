export interface MenuItem {
  label: string;
  run?: () => void | Promise<void>;
  children?: readonly MenuItem[];
  disabled?: boolean;
  checked?: boolean;
}
interface MenuOptions {
  owner: HTMLElement;
  items: readonly MenuItem[];
  point: { x: number; y: number };
  error(message: string): void;
  label?: string;
}

export function createMenu() {
  let menuId = 0;
  return (options: MenuOptions): (() => void) => {
    const session = new MenuSession(options, () => `editor-menu-${++menuId}`);
    session.open();
    return (restore = true) => session.close(restore);
  };
}

/** A small keyboard-accessible menu contained by its owning editor widget. */
class MenuSession {
  private readonly originalFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  private readonly events = new AbortController();
  private readonly panels: HTMLElement[] = [];
  private readonly parents = new WeakMap<HTMLElement, HTMLButtonElement>();
  private isClosed = false;

  constructor(
    private readonly options: MenuOptions,
    private readonly nextId: () => string,
  ) {}

  open(): void {
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.target instanceof Node &&
          !this.panels.some((panel) => panel.contains(event.target as Node))
        ) {
          this.close(false);
        }
      },
      { capture: true, signal: this.events.signal },
    );
    window.addEventListener("blur", () => this.close(false), {
      signal: this.events.signal,
    });
    this.show(this.options.items, this.options.point, 0);
    this.focusFirst(0);
  }

  close(restore = true): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.events.abort();
    this.panels.forEach((panel) => this.removePanel(panel));
    if (restore && this.originalFocus?.isConnected) {
      this.originalFocus.focus();
    }
  }

  private removePanel(panel: HTMLElement): void {
    this.parents.get(panel)?.setAttribute("aria-expanded", "false");
    panel.remove();
  }

  private trim(depth: number): void {
    this.panels.splice(depth).forEach((panel) => this.removePanel(panel));
  }

  private focusFirst(depth: number): void {
    this.panels[depth]
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }

  private show(
    choices: readonly MenuItem[],
    at: { x: number; y: number },
    depth: number,
    parent?: HTMLButtonElement,
  ): void {
    this.trim(depth);
    const panel = document.createElement("div");
    panel.className = "editor-menu";
    panel.id = this.nextId();
    panel.setAttribute("role", "menu");
    panel.setAttribute(
      "aria-label",
      parent?.textContent ?? this.options.label ?? "Table actions",
    );
    panel.style.left = `${at.x}px`;
    panel.style.top = `${at.y}px`;
    if (parent) {
      this.parents.set(panel, parent);
      parent.setAttribute("aria-expanded", "true");
      parent.setAttribute("aria-controls", panel.id);
    }
    const buttons: HTMLButtonElement[] = [];
    for (const item of choices) {
      const button = this.itemButton(item, depth);
      panel.append(button);
      if (!button.disabled) {
        buttons.push(button);
      }
    }
    this.bindPanelKeys({ panel, buttons, depth, ...(parent && { parent }) });
    this.options.owner.append(panel);
    this.panels.push(panel);
    placePanel(panel, at, parent);
  }

  private expand(
    item: MenuItem,
    button: HTMLButtonElement,
    depth: number,
  ): void {
    if (!item.children || button.disabled) {
      return;
    }
    const bounds = button.getBoundingClientRect();
    this.show(
      item.children,
      { x: bounds.right, y: bounds.top },
      depth + 1,
      button,
    );
  }

  private itemButton(item: MenuItem, depth: number): HTMLButtonElement {
    const button = menuButton(item);
    button.addEventListener("mouseenter", () => {
      if (item.children) {
        this.expand(item, button, depth);
      } else {
        this.trim(depth + 1);
      }
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (item.children) {
        this.expand(item, button, depth);
        this.focusFirst(depth + 1);
      } else {
        this.invoke(item);
      }
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" && item.children) {
        event.preventDefault();
        this.expand(item, button, depth);
        this.focusFirst(depth + 1);
      }
    });
    return button;
  }

  private invoke(item: MenuItem): void {
    this.close(false);
    // Restore focus before the action runs. Table focusout clears grid
    // selection after two microtasks; Copy Link for Agent (and captureSelection)
    // must still see the projected table range when they flush asynchronously.
    const restore = this.originalFocus?.isConnected
      ? this.originalFocus
      : this.options.owner.isConnected
        ? this.options.owner
        : undefined;
    restore?.focus({ preventScroll: true });
    Promise.resolve()
      .then(() => item.run?.())
      .catch((reason: unknown) => {
        this.options.error(
          reason instanceof Error
            ? reason.message
            : "The command could not be completed.",
        );
      });
  }

  private bindPanelKeys({
    panel,
    buttons,
    depth,
    parent,
  }: {
    panel: HTMLElement;
    buttons: HTMLButtonElement[];
    depth: number;
    parent?: HTMLButtonElement;
  }): void {
    panel.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const index = menuFocusIndex(event.key, current, buttons.length);
      if (index !== undefined) {
        event.preventDefault();
        buttons[index]?.focus();
      } else if (
        (event.key === "ArrowLeft" || event.key === "Escape") &&
        parent
      ) {
        event.preventDefault();
        this.trim(depth);
        parent.focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        this.close();
      }
    });
  }
}

function menuButton(item: MenuItem): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = item.label;
  button.setAttribute("role", "menuitem");
  button.setAttribute("aria-label", item.label);
  button.tabIndex = -1;
  button.disabled = item.disabled ?? false;
  if (item.checked !== undefined) {
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(item.checked));
    if (item.checked) {
      button.textContent = `${item.label} ✓`;
    }
  }
  if (item.children) {
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.className = "has-submenu";
  }
  return button;
}

function placePanel(
  panel: HTMLElement,
  at: { x: number; y: number },
  parent?: HTMLButtonElement,
): void {
  const bounds = panel.getBoundingClientRect();
  const x =
    bounds.right > innerWidth && parent
      ? parent.getBoundingClientRect().left - bounds.width
      : at.x;
  panel.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 4))}px`;
  panel.style.top = `${Math.max(4, Math.min(at.y, innerHeight - bounds.height - 4))}px`;
}

export function menuFocusIndex(
  key: string,
  current: number,
  count: number,
): number | undefined {
  if (key === "ArrowDown" || key === "ArrowUp") {
    const step = key === "ArrowDown" ? 1 : -1;
    return (current + step + count) % count;
  }
  if (key === "Home" || key === "End") {
    return key === "Home" ? 0 : count - 1;
  }
  return undefined;
}
