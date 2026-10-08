export interface MenuItem {
  label: string;
  run?: () => void | Promise<void>;
  children?: readonly MenuItem[];
  disabled?: boolean;
}

export function createMenu() {
  let menuId = 0;

  /** A small keyboard-accessible menu contained by its owning editor widget. */
  function openMenu(
    owner: HTMLElement,
    items: readonly MenuItem[],
    point: { x: number; y: number },
    error: (message: string) => void,
    label = "Table actions",
  ): () => void {
    const originalFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const events = new AbortController();
    const panels: HTMLElement[] = [];
    const parents = new WeakMap<HTMLElement, HTMLButtonElement>();
    let closed = false;

    const close = (restore = true): void => {
      if (closed) {
        return;
      }
      closed = true;
      events.abort();
      panels.forEach((panel) => {
        parents.get(panel)?.setAttribute("aria-expanded", "false");
        panel.remove();
      });
      if (restore && originalFocus?.isConnected) {
        originalFocus.focus();
      }
    };
    const trim = (depth: number): void => {
      panels.splice(depth).forEach((panel) => {
        parents.get(panel)?.setAttribute("aria-expanded", "false");
        panel.remove();
      });
    };
    const show = (
      choices: readonly MenuItem[],
      at: { x: number; y: number },
      depth: number,
      parent?: HTMLButtonElement,
    ): void => {
      trim(depth);
      const panel = document.createElement("div");
      panel.className = "editor-menu";
      panel.id = `editor-menu-${++menuId}`;
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", parent?.textContent ?? label);
      panel.style.left = `${at.x}px`;
      panel.style.top = `${at.y}px`;
      if (parent) {
        parents.set(panel, parent);
        parent.setAttribute("aria-expanded", "true");
        parent.setAttribute("aria-controls", panel.id);
      }
      const buttons: HTMLButtonElement[] = [];
      choices.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label;
        button.setAttribute("role", "menuitem");
        button.setAttribute("aria-label", item.label);
        button.tabIndex = -1;
        button.disabled = item.disabled ?? false;
        if (item.children) {
          button.setAttribute("aria-haspopup", "menu");
          button.setAttribute("aria-expanded", "false");
          button.className = "has-submenu";
        }
        const expand = (): void => {
          if (!item.children || button.disabled) {
            return;
          }
          const bounds = button.getBoundingClientRect();
          show(item.children, { x: bounds.right, y: bounds.top }, depth + 1, button);
        };
        button.addEventListener("mouseenter", () => {
          if (item.children) {
            expand();
          } else {
            trim(depth + 1);
          }
        });
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (item.children) {
            expand();
            panels[depth + 1]?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
          } else {
            close(false);
            Promise.resolve()
              .then(() => item.run?.())
              .catch((reason: unknown) =>
                error(
                  reason instanceof Error ? reason.message : "The command could not be completed.",
                ),
              );
          }
        });
        button.addEventListener("keydown", (event) => {
          if (event.key === "ArrowRight" && item.children) {
            event.preventDefault();
            expand();
            panels[depth + 1]?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
          }
        });
        panel.append(button);
        if (!button.disabled) {
          buttons.push(button);
        }
      });
      panel.addEventListener("keydown", (event) => {
        event.stopPropagation();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          buttons[(current + step + buttons.length) % buttons.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
        } else if ((event.key === "ArrowLeft" || event.key === "Escape") && parent) {
          event.preventDefault();
          trim(depth);
          parent.focus();
        } else if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          close();
        }
      });
      owner.append(panel);
      panels.push(panel);
      const bounds = panel.getBoundingClientRect();
      const x =
        bounds.right > innerWidth && parent
          ? parent.getBoundingClientRect().left - bounds.width
          : at.x;
      panel.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 4))}px`;
      panel.style.top = `${Math.max(4, Math.min(at.y, innerHeight - bounds.height - 4))}px`;
    };
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.target instanceof Node &&
          !panels.some((panel) => panel.contains(event.target as Node))
        ) {
          close(false);
        }
      },
      { capture: true, signal: events.signal },
    );
    window.addEventListener("blur", () => close(false), {
      signal: events.signal,
    });
    show(items, point, 0);
    panels[0]?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return close;
  }

  return openMenu;
}
