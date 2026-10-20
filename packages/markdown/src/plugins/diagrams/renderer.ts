import type { Logger } from "@workshop/core";
import type { Fence, RenderPass } from "../render/api";
import { sanitizeGraphics } from "../../webview/ui/graphics";
import { errorMessage } from "../../shared/errors";

interface DiagramRender {
  fence: Fence;
  pass: RenderPass;
  isActive: boolean;
}

export class DiagramRenderer {
  private readonly prefix = `mw-${Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(16)).join("-")}`;
  private sequence = 0;
  private queue = Promise.resolve();
  private readonly cleanups = new Set<() => void>();

  constructor(private readonly logger: Logger) {}

  render(fence: Fence, pass: RenderPass): void {
    const request = { fence, pass, isActive: true };
    const original = fence.element.innerHTML;
    let failure: HTMLElement | undefined;
    const cleanup = () => {
      request.isActive = false;
      fence.element.innerHTML = original;
      failure?.remove();
      this.cleanups.delete(cleanup);
    };
    this.cleanups.add(cleanup);
    pass.onDispose(cleanup);
    // Mermaid mutates shared renderer state; one plugin's renders must be serial.
    this.queue = this.queue
      .then(() => this.renderQueued(request))
      .catch((error) => {
        if (request.isActive) {
          // Obsidian-style guarded chrome: title, error, and source.
          failure = showMermaidGuard(fence.element, error, fence.source);
          pass.measure();
          this.logger.warn("Diagram rendering failed", error);
        }
      });
  }

  dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups.clear();
  }

  private async renderQueued(request: DiagramRender): Promise<void> {
    if (!request.isActive) {
      return;
    }
    const { default: mermaid } = await import("mermaid");
    if (!request.isActive) {
      return;
    }
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      theme: document.body.classList.contains("vscode-light")
        ? "default"
        : "dark",
    });
    const result = await mermaid.render(
      `${this.prefix}-${++this.sequence}`,
      request.fence.source,
    );
    if (!request.isActive) {
      return;
    }
    request.fence.element.innerHTML = sanitizeGraphics(result.svg);
    request.fence.element.setAttribute("aria-label", "Mermaid diagram");
    request.pass.measure();
  }
}

/**
 * Obsidian `mermaid-wrapper.is-guarded` chrome when a diagram cannot render
 * (REA app.css ~11494). Lumière keeps htmlLabels off, so there is no Allow
 * button — only the header + source panel with VS Code theme tokens.
 */
export function showMermaidGuard(
  element: HTMLElement,
  error: unknown,
  source: string,
): HTMLElement {
  const doc = element.ownerDocument;
  const wrap = doc.createElement("div");
  wrap.className = "mermaid-wrapper is-guarded";
  wrap.setAttribute("role", "status");

  const header = doc.createElement("div");
  header.className = "mermaid-guard-header";
  const text = doc.createElement("div");
  text.className = "mermaid-guard-text";
  const title = doc.createElement("div");
  title.className = "mermaid-guard-title";
  title.textContent = "Mermaid could not draw this diagram";
  const description = doc.createElement("div");
  description.className = "mermaid-guard-description";
  description.textContent = errorMessage(error);
  text.append(title, description);
  header.append(text);

  const sourceBox = doc.createElement("div");
  sourceBox.className = "mermaid-guard-source";
  const pre = doc.createElement("pre");
  const code = doc.createElement("code");
  code.className = "language-mermaid";
  code.textContent = source;
  pre.append(code);
  sourceBox.append(pre);

  wrap.append(header, sourceBox);
  element.replaceChildren(wrap);
  element.removeAttribute("aria-label");
  return wrap;
}
