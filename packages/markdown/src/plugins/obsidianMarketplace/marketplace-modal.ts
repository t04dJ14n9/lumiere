import type {
  MarketplaceCatalogSnapshot,
  MarketplaceMutationResult,
  MarketplacePluginEntry,
} from "./api";
import {
  filterMarketplaceItems,
  type MarketplaceFilterTab,
  type MarketplaceSortBy,
} from "./catalog-parser";
import { ensureMarketplaceStyles } from "./marketplace-styles";

export interface MarketplaceModalRpc {
  listCatalog(forceRefresh?: boolean): Promise<MarketplaceCatalogSnapshot>;
  installPlugin(id: string, repo?: string): Promise<MarketplaceMutationResult>;
  setPluginEnabled(
    id: string,
    enabled: boolean,
  ): Promise<MarketplaceMutationResult>;
  uninstallPlugin(id: string): Promise<MarketplaceMutationResult>;
}

export class ObsidianMarketplaceModalController {
  private backdropEl: HTMLElement | undefined;
  private listEl: HTMLElement | undefined;
  private statusEl: HTMLElement | undefined;
  private searchInputEl: HTMLInputElement | undefined;
  private snapshot: MarketplaceCatalogSnapshot = {
    trusted: true,
    configDir: ".obsidian",
    items: [],
  };
  private query = "";
  private filter: MarketplaceFilterTab = "all";
  private sort: MarketplaceSortBy = "downloads";
  private busyId: string | undefined;

  constructor(
    private readonly getDocument: () => Document,
    private readonly rpc: MarketplaceModalRpc,
  ) {}

  isOpen(): boolean {
    return Boolean(this.backdropEl?.isConnected);
  }

  getSnapshot(): MarketplaceCatalogSnapshot {
    return this.snapshot;
  }

  async open(initialQuery?: string): Promise<void> {
    const doc = this.getDocument();
    ensureMarketplaceStyles(doc);
    if (typeof initialQuery === "string") {
      this.query = initialQuery;
    }
    if (!this.backdropEl || !this.backdropEl.isConnected) {
      this.mountModal(doc);
    } else if (this.searchInputEl) {
      this.searchInputEl.value = this.query;
    }
    await this.refresh(false);
  }

  close(): void {
    this.backdropEl?.remove();
    this.backdropEl = undefined;
    this.listEl = undefined;
    this.statusEl = undefined;
    this.searchInputEl = undefined;
  }

  applyExternalSnapshot(snapshot: MarketplaceCatalogSnapshot): void {
    this.snapshot = snapshot;
    if (this.isOpen()) {
      this.renderList();
    }
  }

  async refresh(forceRefresh = false): Promise<void> {
    this.setStatus("Loading Obsidian community plugins…");
    try {
      this.snapshot = await this.rpc.listCatalog(forceRefresh);
      this.setStatus(
        this.snapshot.trusted
          ? `${this.snapshot.items.length} plugins available (${this.snapshot.configDir})`
          : "Workspace is untrusted. Trust the workspace to browse and install plugins.",
      );
      this.renderList();
    } catch (error) {
      this.setStatus(`Failed to load marketplace: ${formatError(error)}`);
    }
  }

  private mountModal(doc: Document): void {
    const backdrop = doc.createElement("div");
    backdrop.className = "lumiere-obsidian-marketplace-backdrop";
    backdrop.setAttribute("data-obsidian-marketplace-modal", "true");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        this.close();
      }
    });
    const modal = doc.createElement("div");
    modal.className = "lumiere-obsidian-marketplace-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Obsidian Community Plugins Marketplace");
    modal.appendChild(this.buildHeader(doc));
    modal.appendChild(this.buildToolbar(doc));
    const status = doc.createElement("div");
    status.className = "lumiere-obsidian-marketplace-status";
    status.setAttribute("data-marketplace-status", "true");
    this.statusEl = status;
    modal.appendChild(status);
    const list = doc.createElement("div");
    list.className = "lumiere-obsidian-marketplace-list";
    list.setAttribute("data-marketplace-list", "true");
    this.listEl = list;
    modal.appendChild(list);
    backdrop.appendChild(modal);
    (doc.body ?? doc.documentElement).appendChild(backdrop);
    this.backdropEl = backdrop;
  }

  private buildHeader(doc: Document): HTMLElement {
    const header = doc.createElement("div");
    header.className = "lumiere-obsidian-marketplace-header";
    const title = doc.createElement("h2");
    title.className = "lumiere-obsidian-marketplace-title";
    title.textContent = "Obsidian Community Plugins";
    const closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lumiere-obsidian-marketplace-btn";
    closeBtn.setAttribute("data-marketplace-close", "true");
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);
    return header;
  }

  private buildToolbar(doc: Document): HTMLElement {
    const toolbar = doc.createElement("div");
    toolbar.className = "lumiere-obsidian-marketplace-toolbar";
    const search = doc.createElement("input");
    search.type = "search";
    search.className = "lumiere-obsidian-marketplace-search";
    search.placeholder = "Search community plugins by name, author, or ID…";
    search.value = this.query;
    search.setAttribute("data-marketplace-search", "true");
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList();
    });
    this.searchInputEl = search;
    const filters = this.buildFilterButtons(doc);
    const sortSelect = this.buildSortSelect(doc);
    const refreshBtn = doc.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "lumiere-obsidian-marketplace-btn";
    refreshBtn.setAttribute("data-marketplace-refresh", "true");
    refreshBtn.textContent = "Refresh";
    refreshBtn.addEventListener("click", () => {
      void this.refresh(true);
    });
    toolbar.append(search, filters, sortSelect, refreshBtn);
    return toolbar;
  }

  private buildFilterButtons(doc: Document): HTMLElement {
    const group = doc.createElement("div");
    group.className = "lumiere-obsidian-marketplace-filters";
    const tabs: readonly { id: MarketplaceFilterTab; label: string }[] = [
      { id: "all", label: "All" },
      { id: "installed", label: "Installed" },
      { id: "enabled", label: "Enabled" },
    ];
    for (const tab of tabs) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "lumiere-obsidian-marketplace-filter-btn";
      if (this.filter === tab.id) {
        btn.classList.add("is-active");
      }
      btn.setAttribute("data-marketplace-filter", tab.id);
      btn.textContent = tab.label;
      btn.addEventListener("click", () => {
        this.filter = tab.id;
        for (const child of Array.from(group.children)) {
          child.classList.toggle(
            "is-active",
            child.getAttribute("data-marketplace-filter") === tab.id,
          );
        }
        this.renderList();
      });
      group.appendChild(btn);
    }
    return group;
  }

  private buildSortSelect(doc: Document): HTMLSelectElement {
    const select = doc.createElement("select");
    select.className = "lumiere-obsidian-marketplace-btn";
    select.setAttribute("data-marketplace-sort", "true");
    const optDownloads = doc.createElement("option");
    optDownloads.value = "downloads";
    optDownloads.textContent = "Sort: Popular";
    const optName = doc.createElement("option");
    optName.value = "name";
    optName.textContent = "Sort: Name";
    select.append(optDownloads, optName);
    select.value = this.sort;
    select.addEventListener("change", () => {
      this.sort = select.value === "name" ? "name" : "downloads";
      this.renderList();
    });
    return select;
  }

  private renderList(): void {
    const list = this.listEl;
    if (!list) {
      return;
    }
    const doc = list.ownerDocument;
    list.replaceChildren();
    const visible = filterMarketplaceItems(this.snapshot.items, {
      query: this.query,
      filter: this.filter,
      sort: this.sort,
    });
    if (visible.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "lumiere-obsidian-marketplace-empty";
      empty.textContent = this.snapshot.trusted
        ? "No matching community plugins found."
        : "Community plugins are disabled in untrusted workspaces.";
      list.appendChild(empty);
      return;
    }
    for (const item of visible) {
      list.appendChild(this.renderCard(doc, item));
    }
  }

  private renderCard(doc: Document, item: MarketplacePluginEntry): HTMLElement {
    const card = doc.createElement("div");
    card.className = "lumiere-obsidian-marketplace-card";
    card.setAttribute("data-plugin-id", item.id);
    const top = doc.createElement("div");
    const header = doc.createElement("div");
    header.className = "lumiere-obsidian-marketplace-card-header";
    const nameEl = doc.createElement("span");
    nameEl.className = "lumiere-obsidian-marketplace-card-name";
    nameEl.textContent = item.name;
    header.append(nameEl, this.renderBadges(doc, item));
    const meta = doc.createElement("div");
    meta.className = "lumiere-obsidian-marketplace-meta";
    meta.textContent = formatCardMeta(item);
    const desc = doc.createElement("div");
    desc.className = "lumiere-obsidian-marketplace-desc";
    desc.textContent = item.description;
    top.append(header, meta, desc);
    card.append(top, this.renderActions(doc, item));
    return card;
  }

  private renderBadges(
    doc: Document,
    item: MarketplacePluginEntry,
  ): HTMLElement {
    const badges = doc.createElement("div");
    badges.className = "lumiere-obsidian-marketplace-badges";
    if (item.installedVersion) {
      const ver = doc.createElement("span");
      ver.className = "lumiere-obsidian-marketplace-badge";
      ver.textContent = `v${item.installedVersion}`;
      badges.appendChild(ver);
    }
    if (item.installed) {
      const state = doc.createElement("span");
      state.className = "lumiere-obsidian-marketplace-badge";
      state.setAttribute(
        "data-plugin-badge",
        item.enabled ? "enabled" : "installed",
      );
      state.textContent = item.enabled ? "Enabled" : "Installed";
      badges.appendChild(state);
    }
    return badges;
  }

  private renderActions(
    doc: Document,
    item: MarketplacePluginEntry,
  ): HTMLElement {
    const actions = doc.createElement("div");
    actions.className = "lumiere-obsidian-marketplace-actions";
    const isBusy = this.busyId === item.id;
    if (!item.installed) {
      actions.appendChild(
        this.makeActionButton(doc, {
          label: "Install",
          action: "install",
          extraClass: "is-primary",
          disabled: isBusy,
          onClick: () =>
            this.runAction(item.id, () =>
              this.rpc.installPlugin(item.id, item.repo),
            ),
        }),
      );
      return actions;
    }
    actions.appendChild(
      this.makeActionButton(doc, {
        label: item.enabled ? "Disable" : "Enable",
        action: item.enabled ? "disable" : "enable",
        extraClass: item.enabled ? "" : "is-primary",
        disabled: isBusy,
        onClick: () =>
          this.runAction(item.id, () =>
            this.rpc.setPluginEnabled(item.id, !item.enabled),
          ),
      }),
    );
    if (item.repo) {
      actions.appendChild(
        this.makeActionButton(doc, {
          label: "Update",
          action: "update",
          extraClass: "",
          disabled: isBusy,
          onClick: () =>
            this.runAction(item.id, () =>
              this.rpc.installPlugin(item.id, item.repo),
            ),
        }),
      );
    }
    actions.appendChild(
      this.makeActionButton(doc, {
        label: "Uninstall",
        action: "uninstall",
        extraClass: "is-danger",
        disabled: isBusy,
        onClick: () =>
          this.runAction(item.id, () => this.rpc.uninstallPlugin(item.id)),
      }),
    );
    return actions;
  }

  private makeActionButton(
    doc: Document,
    spec: {
      readonly label: string;
      readonly action: string;
      readonly extraClass: string;
      readonly disabled: boolean;
      readonly onClick: () => Promise<void>;
    },
  ): HTMLButtonElement {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className =
      `lumiere-obsidian-marketplace-btn ${spec.extraClass}`.trim();
    btn.setAttribute("data-marketplace-action", spec.action);
    btn.disabled = spec.disabled;
    btn.textContent = spec.label;
    btn.addEventListener("click", () => {
      void spec.onClick();
    });
    return btn;
  }

  private async runAction(
    id: string,
    op: () => Promise<MarketplaceMutationResult>,
  ): Promise<void> {
    this.busyId = id;
    this.setStatus(`Updating "${id}"…`);
    this.renderList();
    try {
      const result = await op();
      this.snapshot = {
        trusted: result.trusted,
        configDir: result.configDir,
        items: result.items,
      };
      this.setStatus(`Updated "${id}".`);
    } catch (error) {
      this.setStatus(`Action failed for "${id}": ${formatError(error)}`);
    } finally {
      this.busyId = undefined;
      this.renderList();
    }
  }

  private setStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }
}

function formatCardMeta(item: MarketplacePluginEntry): string {
  const parts: string[] = [];
  if (item.author) {
    parts.push(`by ${item.author}`);
  }
  if (item.downloads > 0) {
    parts.push(`${item.downloads.toLocaleString()} downloads`);
  }
  parts.push(item.id);
  return parts.join(" · ");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
