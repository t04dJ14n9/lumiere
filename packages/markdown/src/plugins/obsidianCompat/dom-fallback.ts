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
    for (const token of raw.split(/\s+/).filter(Boolean)) {
      this.set.add(token);
    }
  }

  add(...tokens: string[]): void {
    for (const t of tokens) {
      if (t) {
        this.set.add(t);
      }
    }
    this.sync();
  }

  remove(...tokens: string[]): void {
    for (const t of tokens) {
      this.set.delete(t);
    }
    this.sync();
  }

  toggle(token: string, force?: boolean): boolean {
    const shouldHave = force ?? !this.set.has(token);
    if (shouldHave) {
      this.set.add(token);
    } else {
      this.set.delete(token);
    }
    this.sync();
    return shouldHave;
  }

  contains(token: string): boolean {
    return this.set.has(token);
  }
}

export class MiniElement extends EventTarget {
  tagName: string;
  nodeType = 1;
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
      setProperty(k: string, v: string) {
        styleObj[k] = v;
      },
      removeProperty(k: string) {
        delete styleObj[k];
      },
    };
    this.style = styleObj as MiniElement["style"];
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

  get firstChild(): MiniElement | null {
    return this.children[0] ?? null;
  }

  get isConnected(): boolean {
    return true;
  }

  get textContent(): string {
    if (this.children.length === 0) {
      return this._text;
    }
    return this._text + this.children.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this._text = String(val ?? "");
    this.children.length = 0;
  }

  get innerHTML(): string {
    return this.textContent;
  }

  set innerHTML(val: string) {
    this.textContent = val.replace(/<[^>]*>/g, "");
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

  replaceWith(replacement: MiniElement): void {
    const parent = this.parentNode;
    if (!parent) {
      return;
    }
    const idx = parent.children.indexOf(this);
    if (idx >= 0) {
      replacement.parentNode?.removeChild(replacement);
      replacement.parentNode = parent;
      parent.children[idx] = replacement;
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

  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    const out: MiniElement[] = [];
    const parts = selector.trim().split(/\s*>\s*|\s+/);
    const lastPart = parts[parts.length - 1] ?? selector;
    const visit = (node: MiniElement) => {
      for (const child of node.children) {
        if (matchesCompound(child, lastPart)) {
          out.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return out;
  }
}

function matchesCompound(el: MiniElement, sel: string): boolean {
  const dotIdx = sel.indexOf(".");
  if (dotIdx === 0) {
    return el.classList.contains(sel.slice(1));
  }
  if (dotIdx > 0) {
    const tag = sel.slice(0, dotIdx);
    const cls = sel.slice(dotIdx + 1);
    return (
      el.tagName.toLowerCase() === tag.toLowerCase() &&
      el.classList.contains(cls)
    );
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

const fallbackDoc = {
  body: new MiniElement("body"),
  head: new MiniElement("head"),
  createElement: (tag: string) => new MiniElement(tag),
  createElementNS: (_ns: string, tag: string) => new MiniElement(tag),
  createDocumentFragment: () => new MiniElement("#document-fragment"),
  createTextNode: (text: string) => {
    const span = new MiniElement("#text");
    span.textContent = text;
    return span;
  },
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
    targetGlobal.DocumentFragment = MiniElement;
  }
}
