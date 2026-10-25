import type { Logger } from "@workshop/core";
import type { Fence, RenderPass } from "../render/api";
import { sanitizeGraphics } from "../../webview/ui/graphics";
import { errorMessage } from "../../shared/errors";
import { createMermaidTrust, type MermaidTrust } from "./trust";

export interface MermaidLinkPlace {
  side: boolean;
  tab: boolean;
}

export type MermaidLinkOpen = (
  target: string,
  place: MermaidLinkPlace,
  pass: RenderPass,
) => void;

interface DiagramRender {
  fence: Fence;
  pass: RenderPass;
  isActive: boolean;
  events: AbortController;
}

export class DiagramRenderer {
  private readonly prefix = `mw-${Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(16)).join("-")}`;
  private sequence = 0;
  private queue = Promise.resolve();
  private readonly cleanups = new Set<() => void>();
  private readonly trust: MermaidTrust;
  private readonly openLink: MermaidLinkOpen | undefined;

  constructor(
    private readonly logger: Logger,
    trust: MermaidTrust = createMermaidTrust(),
    openLink?: MermaidLinkOpen,
  ) {
    this.trust = trust;
    this.openLink = openLink;
  }

  render(fence: Fence, pass: RenderPass): void {
    const request: DiagramRender = {
      fence,
      pass,
      isActive: true,
      events: new AbortController(),
    };
    const original = fence.element.innerHTML;
    let failure: HTMLElement | undefined;
    const cleanup = () => {
      request.isActive = false;
      request.events.abort();
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
          // Obsidian-style guarded chrome: title, error, Allow, and source.
          failure = showMermaidGuard(fence.element, error, fence.source, {
            showAllow: !this.trust.isTrusted(),
            onAllow: () => {
              this.trust.allow();
              failure?.remove();
              failure = undefined;
              this.render(fence, pass);
            },
          });
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
    // Obsidian Allow (`mermaid-vault-trust`) enables HTML labels; Lumière still
    // sanitizes SVG output. Untrusted stays strict with htmlLabels off.
    const trusted = this.trust.isTrusted();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: trusted,
      flowchart: { htmlLabels: trusted },
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
    if (this.openLink) {
      wireMermaidInternalLinks(
        request.fence.element,
        (target, place) => this.openLink?.(target, place, request.pass),
        request.events.signal,
      );
    }
    request.pass.measure();
  }
}

/** Where a Mermaid internal-link click or key press opens the note. */
export function placeOfMermaidClick(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): MermaidLinkPlace {
  const mod = Boolean(event.metaKey || event.ctrlKey);
  return { side: mod && Boolean(event.altKey), tab: false };
}

/**
 * Extract the target note name for a Mermaid `.internal-link` SVG node.
 * Prefers explicit link attributes, then the rendered node label text, and
 * falls back to `data-id` or the Mermaid flowchart/state/class node ID.
 */
export function mermaidInternalLinkTarget(node: Element): string | undefined {
  return (
    trimmedAttr(node, "data-href") ??
    trimmedAttr(node, "href") ??
    mermaidNodeLabelText(node) ??
    trimmedAttr(node, "data-id") ??
    nodeIdFallback(trimmedAttr(node, "id") ?? "")
  );
}

function trimmedAttr(node: Element, name: string): string | undefined {
  return node.getAttribute(name)?.trim() || undefined;
}

function mermaidNodeLabelText(node: Element): string | undefined {
  const text =
    node.querySelector?.(".label")?.textContent ??
    node.querySelector?.("text")?.textContent ??
    node.textContent;
  return text?.trim() || undefined;
}

function nodeIdFallback(rawId: string): string | undefined {
  for (const marker of ["-flowchart-", "-state-", "-classId-"]) {
    const start = rawId.indexOf(marker);
    const dash = rawId.lastIndexOf("-");
    if (start >= 0 && dash > start + marker.length - 1) {
      return rawId.slice(start + marker.length, dash).trim() || undefined;
    }
  }
  for (const prefix of ["flowchart-", "state-", "classId-"]) {
    const dash = rawId.lastIndexOf("-");
    if (rawId.startsWith(prefix) && dash >= prefix.length) {
      return rawId.slice(prefix.length, dash).trim() || undefined;
    }
  }
  return undefined;
}

/**
 * Wire `.internal-link` nodes inside a rendered Mermaid SVG container so
 * clicking or pressing Enter/Space opens the target note via the links service.
 */
export function wireMermaidInternalLinks(
  host: ParentNode,
  open: (target: string, place: MermaidLinkPlace) => void,
  signal?: AbortSignal,
): number {
  let wired = 0;
  for (const node of host.querySelectorAll(".internal-link")) {
    if (hasInternalLinkAncestor(node, host)) {
      continue;
    }
    const target = mermaidInternalLinkTarget(node);
    if (!target) {
      continue;
    }
    bindMermaidInternalLinkNode(node, target, open, signal);
    wired++;
  }
  return wired;
}

function hasInternalLinkAncestor(node: Element, host: ParentNode): boolean {
  const ancestor = node.parentElement?.closest?.(".internal-link");
  return Boolean(ancestor && ancestor !== host && host.contains?.(ancestor));
}

function bindMermaidInternalLinkNode(
  node: Element,
  target: string,
  open: (target: string, place: MermaidLinkPlace) => void,
  signal?: AbortSignal,
): void {
  node.setAttribute("data-href", target);
  node.setAttribute("data-wiki", "true");
  node.setAttribute("role", "link");
  node.setAttribute("tabindex", "0");
  const options = signal ? { signal } : undefined;
  node.addEventListener(
    "mousedown",
    (event) => {
      if ((event as MouseEvent).button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    options,
  );
  node.addEventListener(
    "click",
    (event) => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open(target, placeOfMermaidClick(mouse));
    },
    options,
  );
  node.addEventListener(
    "keydown",
    (event) => {
      const key = event as KeyboardEvent;
      if (key.key !== "Enter" && key.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open(target, placeOfMermaidClick(key));
    },
    options,
  );
}

export interface MermaidGuardOptions {
  /** Obsidian shows Allow until the vault is trusted. */
  showAllow?: boolean;
  onAllow?: () => void;
}

/**
 * Obsidian `mermaid-wrapper.is-guarded` chrome when a diagram cannot render
 * (REA app.css ~11494). Allow mirrors `mermaid-vault-trust` + post-processor refresh.
 */
export function showMermaidGuard(
  element: HTMLElement,
  error: unknown,
  source: string,
  options: MermaidGuardOptions = {},
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

  if (options.showAllow && options.onAllow) {
    const actions = doc.createElement("div");
    actions.className = "mermaid-guard-actions";
    const allow = doc.createElement("button");
    allow.type = "button";
    allow.textContent = "Allow";
    allow.setAttribute(
      "aria-label",
      "Allow Mermaid HTML labels for this vault",
    );
    allow.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onAllow?.();
    });
    actions.append(allow);
    header.append(actions);
  }

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
