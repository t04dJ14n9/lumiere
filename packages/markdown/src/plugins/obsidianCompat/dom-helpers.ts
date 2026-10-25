import { ensureDomPrototypesTarget, getDomDocument } from "./dom-fallback";
import { installDomPrototypes } from "./dom-prototypes";

export { getDomDocument };

export interface DomElementInfo {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
  parent?: Node;
  prepend?: boolean;
}

export type ObsidianDomElement = HTMLElement;

declare global {
  interface HTMLElement {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      callback?: (el: HTMLElementTagNameMap[K]) => void,
    ): HTMLElementTagNameMap[K];
    createDiv(
      o?: DomElementInfo | string,
      callback?: (el: HTMLDivElement) => void,
    ): HTMLDivElement;
    createSpan(
      o?: DomElementInfo | string,
      callback?: (el: HTMLSpanElement) => void,
    ): HTMLSpanElement;
    createSvg<K extends keyof SVGElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      callback?: (el: SVGElementTagNameMap[K]) => void,
    ): SVGElementTagNameMap[K];
    empty(): void;
    detach(): void;
    addClass(...classes: string[]): void;
    addClasses(classes: string[]): void;
    removeClass(...classes: string[]): void;
    removeClasses(classes: string[]): void;
    toggleClass(classes: string | string[], value: boolean): void;
    hasClass(cls: string): boolean;
    setText(val: string | DocumentFragment): void;
    getText(): string;
    appendText(val: string): void;
    instanceOf<T>(type: new (...args: never[]) => T): boolean;
    setChildrenInPlace(children: Node[]): void;
    onNodeInserted(listener: () => unknown, once?: boolean): () => void;
    setAttr(
      qualifiedName: string,
      value: string | number | boolean | null,
    ): void;
    setAttrs(obj: Record<string, string | number | boolean | null>): void;
    getAttr(qualifiedName: string): string | null;
    setCssProps(props: Record<string, string>): void;
    setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
    show(): void;
    hide(): void;
    toggle(show?: boolean): void;
    toggleVisibility(visible: boolean): void;
    isShown(): boolean;
    find(selector: string): HTMLElement | null;
    findAll(selector: string): HTMLElement[];
    findAllSelf(selector: string): HTMLElement[];
    matchParent(selector: string, lastParent?: Element): HTMLElement | null;
    onClickEvent(
      listener: (ev: MouseEvent) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    onNodeInserted(listener: () => unknown, once?: boolean): () => void;
    instanceOf<T>(type: new (...args: never[]) => T): this is T;
  }
  interface DocumentFragment {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      callback?: (el: HTMLElementTagNameMap[K]) => void,
    ): HTMLElementTagNameMap[K];
    createDiv(
      o?: DomElementInfo | string,
      callback?: (el: HTMLDivElement) => void,
    ): HTMLDivElement;
    createSpan(
      o?: DomElementInfo | string,
      callback?: (el: HTMLSpanElement) => void,
    ): HTMLSpanElement;
    createSvg<K extends keyof SVGElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      callback?: (el: SVGElementTagNameMap[K]) => void,
    ): SVGElementTagNameMap[K];
    empty(): void;
    detach(): void;
    setText(val: string | DocumentFragment): void;
    find(selector: string): HTMLElement | null;
    findAll(selector: string): HTMLElement[];
  }
}

export function splitClasses(input: string | string[] | undefined): string[] {
  if (!input) {
    return [];
  }
  const list = Array.isArray(input) ? input : [input];
  return list.flatMap((item) => String(item).split(/\s+/).filter(Boolean));
}

export function applyElementInfo(
  el: Element,
  info?: DomElementInfo | string,
): void {
  if (!info) {
    return;
  }
  const normalized: DomElementInfo =
    typeof info === "string" ? { cls: info } : info;
  const classes = splitClasses(normalized.cls);
  if (classes.length > 0) {
    el.classList.add(...classes);
  }
  if (normalized.text !== undefined) {
    setNodeText(el, normalized.text);
  }
  if (normalized.attr) {
    setElementAttrs(el, normalized.attr);
  }
  applyStandardDomProps(el, normalized);
  if (normalized.parent) {
    if (normalized.prepend && normalized.parent.firstChild) {
      normalized.parent.insertBefore(el, normalized.parent.firstChild);
    } else {
      normalized.parent.appendChild(el);
    }
  }
}

function applyStandardDomProps(el: Element, info: DomElementInfo): void {
  const keys = ["title", "value", "type", "placeholder", "href"] as const;
  const record = el as unknown as Record<string, unknown>;
  for (const key of keys) {
    const val = info[key];
    if (val !== undefined && key in el) {
      record[key] = val;
    }
  }
}

export function setNodeText(node: Node, val: string | DocumentFragment): void {
  if (typeof val === "string") {
    node.textContent = val;
    return;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  node.textContent = "";
  node.appendChild(val);
}

export function setElementAttr(
  el: Element,
  qualifiedName: string,
  value: string | number | boolean | null,
): void {
  if (value === null || value === false) {
    el.removeAttribute(qualifiedName);
  } else if (value === true) {
    el.setAttribute(qualifiedName, "");
  } else {
    el.setAttribute(qualifiedName, String(value));
  }
}

export function setElementAttrs(
  el: Element,
  attrs: Record<string, string | number | boolean | null>,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    setElementAttr(el, key, value);
  }
}

export function createChildEl<K extends keyof HTMLElementTagNameMap>(
  parent: Node | null,
  tag: K,
  info?: DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
  const doc = parent?.ownerDocument ?? getDomDocument();
  const el = doc.createElement(tag);
  const opts = typeof info === "string" ? { cls: info } : { ...info };
  if (parent && !opts.parent) {
    opts.parent = parent;
  }
  applyElementInfo(el, opts);
  callback?.(el);
  return el;
}

export function createChildSvg<K extends keyof SVGElementTagNameMap>(
  parent: Node | null,
  tag: K,
  info?: DomElementInfo | string,
  callback?: (el: SVGElementTagNameMap[K]) => void,
): SVGElementTagNameMap[K] {
  const doc = parent?.ownerDocument ?? getDomDocument();
  const el = doc.createElementNS("http://www.w3.org/2000/svg", tag);
  const opts = typeof info === "string" ? { cls: info } : { ...info };
  if (parent && !opts.parent) {
    opts.parent = parent;
  }
  applyElementInfo(el, opts);
  callback?.(el);
  return el;
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  info?: DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
  return createChildEl(null, tag, info, callback);
}

export function createDiv(
  info?: DomElementInfo | string,
  callback?: (el: HTMLDivElement) => void,
): HTMLDivElement {
  return createChildEl(null, "div", info, callback);
}

export function createSpan(
  info?: DomElementInfo | string,
  callback?: (el: HTMLSpanElement) => void,
): HTMLSpanElement {
  return createChildEl(null, "span", info, callback);
}

export function createSvg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  info?: DomElementInfo | string,
  callback?: (el: SVGElementTagNameMap[K]) => void,
): SVGElementTagNameMap[K] {
  return createChildSvg(null, tag, info, callback);
}

export function createFragment(
  callback?: (frag: DocumentFragment) => void,
): DocumentFragment {
  const frag = getDomDocument().createDocumentFragment();
  callback?.(frag);
  return frag;
}

/** Idempotently installs Obsidian DOM helper methods onto prototype chains. */
export function installDomHelpers(
  targetGlobal: Record<PropertyKey, unknown> = globalThis,
): void {
  ensureDomPrototypesTarget(targetGlobal);
  installDomPrototypes(targetGlobal, {
    createEl,
    createDiv,
    createSpan,
    createSvg,
    createFragment,
  });
}

export const installObsidianDomHelpers = installDomHelpers;
