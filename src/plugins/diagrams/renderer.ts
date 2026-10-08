import type { Logger } from "../../kernel";
import type { Fence, RenderPass } from "../render/api";
import { sanitizeGraphics } from "../../webview/ui/graphics";

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
    const cleanup = () => {
      request.isActive = false;
      fence.element.innerHTML = original;
      this.cleanups.delete(cleanup);
    };
    this.cleanups.add(cleanup);
    pass.onDispose(cleanup);
    // Mermaid mutates shared renderer state; one plugin's renders must be serial.
    this.queue = this.queue
      .then(() => this.renderQueued(request))
      .catch((error) => {
        if (request.isActive) {
          fence.element.title = String(error);
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
