import { ViewPlugin } from "@codemirror/view";
const css = `
.image-inspector {
  width: calc(100vw - 48px);
  height: calc(100vh - 48px);
  max-width: none;
  max-height: none;
  padding: 0;
  border: 1px solid var(--line, #8884);
  border-radius: 6px;
  color: var(--vscode-editor-foreground, #ddd);
  background: var(--vscode-editor-background, #202024);
}
.image-inspector[open] {
  display: flex;
  flex-direction: column;
}
.image-inspector::backdrop {
  background: #0009;
}
.image-inspector nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
}
.image-inspector button {
  font: inherit;
  color: inherit;
  background: var(--vscode-button-secondaryBackground, #333);
  border: 0;
  border-radius: 4px;
  padding: 5px 10px;
  cursor: pointer;
}
.image-inspector button:disabled {
  opacity: 0.45;
  cursor: default;
}
.image-inspector :focus-visible {
  outline: 2px solid var(--vscode-focusBorder, #7799ff);
  outline-offset: -2px;
}
.image-inspector output {
  min-width: 4em;
  text-align: center;
}
.image-inspector .media-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 24px;
  text-align: center;
}
.image-inspector img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  vertical-align: top;
}
.image-inspector .actual-size {
  text-align: left;
  cursor: grab;
}
.image-inspector .actual-size img {
  max-width: none;
  max-height: none;
}
.image-inspector .panning {
  cursor: grabbing;
  user-select: none;
}
.image-inspector > p {
  margin: 8px 16px;
}
.inspect-image {
  vertical-align: top;
  border: 0;
  border-radius: 4px;
  color: var(--accent);
  background: transparent;
  cursor: pointer;
  padding: 3px;
}
`;
export const imageStyles = ViewPlugin.fromClass(
  class {
    readonly style: HTMLStyleElement;
    constructor() {
      this.style = document.createElement("style");
      this.style.textContent = css;
      document.head.append(this.style);
    }
    destroy(): void {
      this.style.remove();
    }
  },
);
