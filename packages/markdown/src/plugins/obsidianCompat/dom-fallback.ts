/**
 * Minimal DOM element shim used only in headless Node unit tests where
 * `globalThis.document` is not provided by a browser or JSDOM.
 */
class MiniClassList {
  private readonly set = new Set<string>();
  constructor(private readonly owner: MiniElement) {}

  private sync(): void {
    this.owner.className = [...this.set].join(" ");
  }

  loadFrom(raw: string): void {
    this.set.clear();
    raw
      .split(/\s+/)
      .filter(Boolean)
      .forEach((t) => this.set.add(t));
  }

  add(...tokens: string[]): void {
    tokens.filter(Boolean).forEach((t) => this.set.add(t));
    this.sync();
  }

  remove(...tokens: string[]): void {
    tokens.forEach((t) => this.set.delete(t));
    this.sync();
  }

  toggle(token: string, force?: boolean): boolean {
    const keep = force ?? !this.set.has(token);
    this.set[keep ? "add" : "delete"](token);
    this.sync();
    return keep;
  }

  contains(token: string): boolean {
    return this.set.has(token);
  }

  forEach(cb: (token: string) => void): void {
    this.set.forEach((t) => cb(t));
  }
}

export class MiniElement extends EventTarget {
  tagName: string;
  private _className = "";
  readonly classList: MiniClassList;
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> & {
    setProperty: (k: string, v: string) => void;
    removeProperty: (k: string) => void;
  };
  private readonly attrs = new Map<string, string>();
  readonly children: MiniElement[] = [];
  parentNode: MiniElement | null = null;
  private _text = "";
  value = "";
  type = "";
  placeholder = "";
  title = "";
  href = "";
  disabled = false;
  min = "";
  max = "";
  step = "";
  scrollTop = 0;

  constructor(tag: string) {
    super();
    this.tagName = tag.toUpperCase();
    this.classList = new MiniClassList(this);
    const styleObj: Record<string, unknown> = {
      setProperty: (k: string, v: string) => {
        styleObj[k] = v;
      },
      removeProperty: (k: string) => {
        delete styleObj[k];
      },
    };
    this.style = styleObj as MiniElement["style"];
  }

  private materializeText(): void {
    if (this.children.length === 0 && this._text && this.tagName !== "#TEXT") {
      const text = this._text;
      this._text = "";
      this.appendChild(fallbackDoc.createTextNode(text));
    }
  }

  get nodeType(): number {
    const types: Record<string, number> = {
      "#TEXT": 3,
      "#DOCUMENT-FRAGMENT": 11,
    };
    return types[this.tagName] ?? 1;
  }

  get nodeName(): string {
    return this.tagName;
  }

  get className(): string {
    return this._className;
  }

  set className(val: string) {
    this._className = val;
    this.classList.loadFrom(val);
  }

  get parentElement(): MiniElement | null {
    return this.parentNode;
  }

  get childNodes(): MiniElement[] {
    this.materializeText();
    return this.children;
  }

  get childElementCount(): number {
    return this.children.length;
  }

  get firstChild(): MiniElement | null {
    this.materializeText();
    return this.firstElementChild;
  }
  get firstElementChild(): MiniElement | null {
    return this.children[0] ?? null;
  }
  get lastChild(): MiniElement | null {
    this.materializeText();
    return this.lastElementChild;
  }
  get lastElementChild(): MiniElement | null {
    return this.children.at(-1) ?? null;
  }

  private siblingAt(offset: number): MiniElement | null {
    const list = this.parentNode?.children;
    const idx = list ? list.indexOf(this) : -1;
    return idx >= 0 ? (list?.[idx + offset] ?? null) : null;
  }
  get nextSibling(): MiniElement | null {
    return this.siblingAt(1);
  }
  get previousSibling(): MiniElement | null {
    return this.siblingAt(-1);
  }

  get isConnected(): boolean {
    return true;
  }
  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  set id(val: string) {
    this.setAttribute("id", val);
  }
  get ownerDocument(): Document {
    return fallbackDoc as unknown as Document;
  }
  click(): void {
    this.dispatchEvent(new Event("click"));
  }

  get textContent(): string {
    return this._text + this.children.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this._text = String(val ?? "");
    this.children.length = 0;
  }

  get innerText(): string {
    return this.textContent;
  }
  set innerText(val: string) {
    this.textContent = val;
  }
  get data(): string {
    return this.textContent;
  }
  set data(val: string) {
    this.textContent = val;
  }
  get nodeValue(): string | null {
    return this.tagName === "#TEXT" ? this.textContent : null;
  }
  set nodeValue(val: string | null) {
    this.textContent = String(val ?? "");
  }
  get innerHTML(): string {
    return this.textContent;
  }
  set innerHTML(val: string) {
    this.textContent = val.replace(/<[^>]*>/g, "");
  }

  hasChildNodes(): boolean {
    return this.children.length > 0 || Boolean(this._text);
  }

  appendChild<T extends MiniElement>(child: T): T {
    if (child.tagName === "#DOCUMENT-FRAGMENT") {
      for (const grand of [...child.children]) {
        this.appendChild(grand);
      }
      if (child._text) {
        this._text += child._text;
      }
      return child;
    }
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: Array<MiniElement | string>): void {
    for (const item of nodes) {
      const n =
        typeof item === "string" ? fallbackDoc.createTextNode(item) : item;
      this.appendChild(n);
    }
  }

  prepend(...nodes: Array<MiniElement | string>): void {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const item = nodes[i]!;
      const n =
        typeof item === "string" ? fallbackDoc.createTextNode(item) : item;
      this.insertBefore(n, this.children[0] ?? null);
    }
  }

  replaceChildren(...nodes: Array<MiniElement | string>): void {
    for (const c of this.children) {
      c.parentNode = null;
    }
    this.children.length = 0;
    this._text = "";
    this.append(...nodes);
  }

  insertBefore<T extends MiniElement>(child: T, ref: MiniElement | null): T {
    if (!ref) {
      return this.appendChild(child);
    }
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    const idx = this.children.indexOf(ref);
    if (idx >= 0) {
      this.children.splice(idx, 0, child);
    } else {
      this.children.push(child);
    }
    return child;
  }

  removeChild<T extends MiniElement>(child: T): T {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceWith(...nodes: Array<MiniElement | string>): void {
    const converted = nodes.map((n) =>
      typeof n === "string" ? fallbackDoc.createTextNode(n) : n,
    );
    const parent = this.parentNode;
    if (!parent) {
      this.replaceChildren(...converted);
      return;
    }
    const idx = parent.children.indexOf(this);
    if (idx >= 0) {
      for (const item of converted) {
        item.parentNode?.removeChild(item);
        item.parentNode = parent;
      }
      parent.children.splice(idx, 1, ...converted);
      this.parentNode = null;
    }
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name: string, val: string): void {
    this.attrs.set(name, val);
    if (name.startsWith("data-")) {
      const camel = name
        .slice(5)
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      this.dataset[camel] = val;
    }
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  getAttributeNames(): string[] {
    return [...this.attrs.keys()];
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  matches(selector: string): boolean {
    const clean = selector.trim();
    if (clean.startsWith(".")) {
      return this.classList.contains(clean.slice(1));
    }
    return this.tagName.toLowerCase() === clean.toLowerCase();
  }

  getElementsByClassName(cls: string): MiniElement[] {
    return this.querySelectorAll(`.${cls.trim()}`);
  }

  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    const out: MiniElement[] = [];
    const parts = selector
      .trim()
      .split(/\s*>\s*|\s+/)
      .filter(Boolean);
    const visit = (node: MiniElement) => {
      for (const child of node.children) {
        if (matchesSelectorParts(child, parts)) {
          out.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    Object.assign(out, { item: (i: number) => out[i] ?? null });
    return out;
  }
}

function matchesSelectorParts(
  el: MiniElement,
  parts: readonly string[],
): boolean {
  if (parts.length === 0 || !matchesCompound(el, parts[parts.length - 1]!)) {
    return false;
  }
  let cur: MiniElement | null = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (cur && !matchesCompound(cur, parts[i]!)) {
      cur = cur.parentNode;
    }
    if (!cur) {
      return false;
    }
    cur = cur.parentNode;
  }
  return true;
}

function matchesCompound(el: MiniElement, sel: string): boolean {
  if (sel.startsWith("#")) {
    return el.id === sel.slice(1);
  }
  if (sel.startsWith("[") && sel.endsWith("]")) {
    const inner = sel.slice(1, -1);
    const eq = inner.indexOf("=");
    if (eq < 0) {
      return el.hasAttribute(inner);
    }
    const val = inner.slice(eq + 1).replace(/^["']|["']$/g, "");
    return el.getAttribute(inner.slice(0, eq)) === val;
  }
  const dotIdx = sel.indexOf(".");
  if (dotIdx === 0) {
    return el.classList.contains(sel.slice(1));
  }
  if (dotIdx > 0) {
    return (
      el.tagName.toLowerCase() === sel.slice(0, dotIdx).toLowerCase() &&
      el.classList.contains(sel.slice(dotIdx + 1))
    );
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

const fallbackDoc = {
  body: new MiniElement("body"),
  head: new MiniElement("head"),
  adoptedStyleSheets: [] as unknown[],
  createElement: (tag: string) => new MiniElement(tag),
  createElementNS: (_ns: string, tag: string) => new MiniElement(tag),
  createDocumentFragment: () => new MiniElement("#document-fragment"),
  createTextNode: (text: string) => {
    const span = new MiniElement("#text");
    span.textContent = text;
    return span;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: (id: string) =>
    fallbackDoc.head.querySelector(`#${id}`) ??
    fallbackDoc.body.querySelector(`#${id}`),
  querySelector: (sel: string) => fallbackDoc.body.querySelector(sel),
  querySelectorAll: (sel: string) => fallbackDoc.body.querySelectorAll(sel),
};

export function getDomDocument(): Document {
  if (typeof document !== "undefined") {
    return document;
  }
  return fallbackDoc as unknown as Document;
}

export function ensureDomPrototypesTarget(
  targetGlobal: Record<PropertyKey, unknown>,
): void {
  if (!targetGlobal.HTMLElement) {
    targetGlobal.Node = MiniElement;
    targetGlobal.Element = MiniElement;
    targetGlobal.HTMLElement = MiniElement;
    targetGlobal.HTMLParagraphElement = MiniElement;
    targetGlobal.HTMLDetailsElement = MiniElement;
    targetGlobal.DocumentFragment = MiniElement;
  }
}
