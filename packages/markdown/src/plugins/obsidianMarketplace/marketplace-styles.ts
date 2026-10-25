const STYLE_ELEMENT_ID = "lumiere-obsidian-marketplace-styles";

const MARKETPLACE_CSS = `
.lumiere-obsidian-marketplace-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
}
.lumiere-obsidian-marketplace-modal {
  width: min(860px, 100%);
  max-height: min(680px, 90vh);
  background: var(--vscode-editorWidget-background, #1e1e1e);
  color: var(--vscode-editorWidget-foreground, #cccccc);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lumiere-obsidian-marketplace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #333333);
}
.lumiere-obsidian-marketplace-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.lumiere-obsidian-marketplace-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #333333);
}
.lumiere-obsidian-marketplace-search {
  flex: 1 1 240px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  background: var(--vscode-input-background, #252526);
  color: var(--vscode-input-foreground, #cccccc);
  font-size: 13px;
}
.lumiere-obsidian-marketplace-filters {
  display: flex;
  gap: 4px;
}
.lumiere-obsidian-marketplace-filter-btn,
.lumiere-obsidian-marketplace-btn {
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--vscode-button-border, #3c3c3c);
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #ffffff);
  font-size: 12px;
  cursor: pointer;
}
.lumiere-obsidian-marketplace-filter-btn.is-active,
.lumiere-obsidian-marketplace-btn.is-primary {
  background: var(--vscode-button-background, #7c3aed);
  color: var(--vscode-button-foreground, #ffffff);
}
.lumiere-obsidian-marketplace-btn.is-danger {
  background: rgba(220, 38, 38, 0.2);
  color: #f87171;
  border-color: rgba(220, 38, 38, 0.45);
}
.lumiere-obsidian-marketplace-status {
  padding: 8px 18px;
  font-size: 12px;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #333333);
}
.lumiere-obsidian-marketplace-list {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.lumiere-obsidian-marketplace-card {
  border: 1px solid var(--vscode-editorWidget-border, #333333);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  background: var(--vscode-editor-background, #181818);
}
.lumiere-obsidian-marketplace-card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.lumiere-obsidian-marketplace-card-name {
  font-weight: 600;
  font-size: 14px;
}
.lumiere-obsidian-marketplace-badges {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
}
.lumiere-obsidian-marketplace-badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(124, 58, 237, 0.2);
  color: #c4b5fd;
}
.lumiere-obsidian-marketplace-meta {
  font-size: 12px;
  opacity: 0.78;
}
.lumiere-obsidian-marketplace-desc {
  font-size: 12.5px;
  line-height: 1.45;
  opacity: 0.9;
}
.lumiere-obsidian-marketplace-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
`;

export function ensureMarketplaceStyles(doc: Document): () => void {
  const existing = doc.getElementById(STYLE_ELEMENT_ID);
  if (existing) {
    return () => {};
  }
  const style = doc.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = MARKETPLACE_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
  return () => {
    style.remove();
  };
}
