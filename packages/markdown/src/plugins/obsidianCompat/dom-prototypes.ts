import {
  createChildEl,
  createChildSvg,
  setElementAttr,
  setElementAttrs,
  setNodeText,
  splitClasses,
  type DomElementInfo,
} from "./dom-helpers";

const INSTALLED_FLAG = Symbol.for("lumiere.obsidian.domHelpersInstalled");

function defineIfMissing(
  proto: object,
  name: string,
  fn: (...args: never[]) => unknown,
): void {
  if (name in proto) {
    return;
  }
  Object.defineProperty(proto, name, {
    value: fn,
    configurable: true,
    writable: true,
  });
}

function buildNodeMethods(getSelf: (ctx: unknown) => Node) {
  return {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      callback?: (el: HTMLElementTagNameMap[K]) => void,
    ) {
      return createChildEl(getSelf(this), tag, o, callback);
    },
    createDiv(o?: DomElementInfo | string, cb?: (el: HTMLDivElement) => void) {
      return createChildEl(getSelf(this), "div", o, cb);
    },
    createSpan(
      o?: DomElementInfo | string,
      cb?: (el: HTMLSpanElement) => void,
    ) {
      return createChildEl(getSelf(this), "span", o, cb);
    },
    createSvg<K extends keyof SVGElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      cb?: (el: SVGElementTagNameMap[K]) => void,
    ) {
      return createChildSvg(getSelf(this), tag, o, cb);
    },
    empty() {
      const node = getSelf(this);
      while (node.firstChild) {
        node.removeChild(node.firstChild);
      }
      node.textContent = "";
    },
    detach() {
      const node = getSelf(this);
      node.parentNode?.removeChild(node);
    },
    setText(val: string | DocumentFragment) {
      setNodeText(getSelf(this), val);
    },
    getText(): string {
      return getSelf(this).textContent ?? "";
    },
  };
}

function buildClassAndAttrMethods(getSelf: (ctx: unknown) => HTMLElement) {
  return {
    addClass(...classes: string[]) {
      const tokens = splitClasses(classes);
      if (tokens.length > 0) {
        getSelf(this).classList.add(...tokens);
      }
    },
    addClasses(classes: string[]) {
      const tokens = splitClasses(classes);
      if (tokens.length > 0) {
        getSelf(this).classList.add(...tokens);
      }
    },
    removeClass(...classes: string[]) {
      const tokens = splitClasses(classes);
      if (tokens.length > 0) {
        getSelf(this).classList.remove(...tokens);
      }
    },
    removeClasses(classes: string[]) {
      const tokens = splitClasses(classes);
      if (tokens.length > 0) {
        getSelf(this).classList.remove(...tokens);
      }
    },
    toggleClass(classes: string | string[], value: boolean) {
      const el = getSelf(this);
      for (const token of splitClasses(classes)) {
        el.classList.toggle(token, Boolean(value));
      }
    },
    hasClass(cls: string): boolean {
      return getSelf(this).classList.contains(cls);
    },
    setAttr(name: string, value: string | number | boolean | null) {
      setElementAttr(getSelf(this), name, value);
    },
    setAttrs(obj: Record<string, string | number | boolean | null>) {
      setElementAttrs(getSelf(this), obj);
    },
    getAttr(name: string): string | null {
      return getSelf(this).getAttribute(name);
    },
  };
}

function buildStyleMethods(getSelf: (ctx: unknown) => HTMLElement) {
  return {
    setCssProps(props: Record<string, string>) {
      const el = getSelf(this);
      for (const [k, v] of Object.entries(props)) {
        el.style.setProperty(k, v);
      }
    },
    setCssStyles(styles: Partial<CSSStyleDeclaration>) {
      const el = getSelf(this);
      for (const [k, v] of Object.entries(styles)) {
        if (typeof v === "string") {
          (el.style as unknown as Record<string, string>)[k] = v;
        }
      }
    },
    show() {
      const el = getSelf(this);
      if (el.style.display === "none") {
        el.style.removeProperty("display");
      }
    },
    hide() {
      getSelf(this).style.display = "none";
    },
    toggle(show?: boolean) {
      const el = getSelf(this);
      const shouldShow = show ?? el.style.display === "none";
      if (shouldShow && el.style.display === "none") {
        el.style.removeProperty("display");
      } else if (!shouldShow) {
        el.style.display = "none";
      }
    },
    toggleVisibility(visible: boolean) {
      getSelf(this).style.visibility = visible ? "" : "hidden";
    },
    isShown(): boolean {
      const el = getSelf(this);
      return el.style.display !== "none" && el.isConnected;
    },
  };
}

function buildQueryMethods(getSelf: (ctx: unknown) => HTMLElement) {
  return {
    find(selector: string): HTMLElement | null {
      return getSelf(this).querySelector<HTMLElement>(selector);
    },
    findAll(selector: string): HTMLElement[] {
      return Array.from(getSelf(this).querySelectorAll<HTMLElement>(selector));
    },
    findAllSelf(selector: string): HTMLElement[] {
      const el = getSelf(this);
      const out = Array.from(el.querySelectorAll<HTMLElement>(selector));
      if (el.matches?.(selector)) {
        out.unshift(el);
      }
      return out;
    },
    matchParent(selector: string, lastParent?: Element): HTMLElement | null {
      let cur: Element | null = getSelf(this);
      while (cur && cur !== lastParent) {
        if (cur.matches?.(selector)) {
          return cur as HTMLElement;
        }
        cur = cur.parentElement;
      }
      return null;
    },
    onClickEvent(
      listener: (ev: MouseEvent) => unknown,
      options?: boolean | AddEventListenerOptions,
    ) {
      const el = getSelf(this);
      el.addEventListener("click", listener as EventListener, options);
      el.addEventListener("auxclick", listener as EventListener, options);
    },
  };
}

export function installDomPrototypes(
  targetGlobal: Record<PropertyKey, unknown>,
  globals: Record<string, unknown>,
): void {
  targetGlobal[INSTALLED_FLAG] = true;
  const nodeProto = (targetGlobal.Node as { prototype?: object } | undefined)
    ?.prototype;
  const elementProto = (
    targetGlobal.Element as { prototype?: object } | undefined
  )?.prototype;
  const htmlProto = (
    targetGlobal.HTMLElement as { prototype?: object } | undefined
  )?.prototype;
  const fragProto = (
    targetGlobal.DocumentFragment as { prototype?: object } | undefined
  )?.prototype;

  const nodeMethods = buildNodeMethods((ctx) => ctx as Node);
  const elMethods = {
    ...buildClassAndAttrMethods((ctx) => ctx as HTMLElement),
    ...buildStyleMethods((ctx) => ctx as HTMLElement),
    ...buildQueryMethods((ctx) => ctx as HTMLElement),
  };

  for (const proto of [nodeProto, elementProto, htmlProto, fragProto]) {
    if (!proto) {
      continue;
    }
    for (const [name, fn] of Object.entries(nodeMethods)) {
      defineIfMissing(proto, name, fn as (...args: never[]) => unknown);
    }
  }
  for (const proto of [elementProto, htmlProto, fragProto]) {
    if (!proto) {
      continue;
    }
    for (const [name, fn] of Object.entries(elMethods)) {
      defineIfMissing(proto, name, fn as (...args: never[]) => unknown);
    }
  }
  for (const [name, fn] of Object.entries(globals)) {
    defineIfMissing(targetGlobal, name, fn as (...args: never[]) => unknown);
  }
}
