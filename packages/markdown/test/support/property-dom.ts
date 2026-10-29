import type { TestContext } from "node:test";

/** Narrow event/focus fakes: these units do not claim browser layout or selection parity. */
export class PropertyElement extends EventTarget {
  tagName = "DIV";
  dataset: Record<string, string> = {};
  textContent = "";
  value = "";
  defaultValue = "";
  title = "";
  hidden = false;
  disabled = false;
  checked = false;
  isConnected = true;
  contentEditable = "true";
  type = "text";
  className = "";
  id = "";
  innerHTML = "";
  parentElement: PropertyElement | null = null;
  children: PropertyElement[] = [];
  ownerDocument: PropertyDocument;
  focused = 0;
  validityMessage = "";
  readonly attributes = new Map<string, string>();
  readonly classList = {
    contains: (name: string) => ` ${this.className} `.includes(` ${name} `),
    toggle: () => {},
    add: () => {},
    remove: () => {},
  };
  find: (selector: string) => PropertyElement | null = () => null;
  findAll: (selector: string) => PropertyElement[] = () => [];
  nearest: (selector: string) => PropertyElement | null = () =>
    this.parentElement;

  constructor(document: PropertyDocument) {
    super();
    this.ownerDocument = document;
  }
  focus() {
    this.ownerDocument.activeElement = this;
    this.focused++;
  }
  select() {}
  setSelectionRange() {}
  setCustomValidity(message: string) {
    this.validityMessage = message;
  }
  checkValidity() {
    return !this.validityMessage;
  }
  reportValidity() {
    return !this.validityMessage;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  toggleAttribute(name: string, present: boolean) {
    if (present) {
      this.setAttribute(name, "");
    } else {
      this.removeAttribute(name);
    }
  }
  querySelector(selector: string) {
    return this.find(selector);
  }
  querySelectorAll(selector: string) {
    return this.findAll(selector);
  }
  get firstElementChild(): PropertyElement | null {
    return this.children[0] ?? null;
  }
  append(element: PropertyElement) {
    this.children.push(element);
    element.parentElement = this;
  }
  replaceChildren() {
    this.children = [];
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(
        (element) => element !== this,
      );
    }
    this.isConnected = false;
  }
  closest(selector: string) {
    return this.nearest(selector);
  }
  contains(element: PropertyElement): boolean {
    return (
      element === this || this.children.some((child) => child.contains(element))
    );
  }
  replaceWith(element: PropertyElement) {
    if (this.parentElement) {
      const parent = this.parentElement;
      parent.children[parent.children.indexOf(this)] = element;
      element.parentElement = parent;
    }
    this.isConnected = false;
  }
}
export class PropertyNativeInput extends PropertyElement {
  override tagName = "INPUT";
}
export class PropertyTextarea extends PropertyElement {
  override tagName = "TEXTAREA";
}
export class PropertyDocument {
  activeElement: PropertyElement | null = null;
  querySelector() {
    return null;
  }
  createElement(tag: string) {
    return tag === "input"
      ? new PropertyNativeInput(this)
      : new PropertyElement(this);
  }
  createRange() {
    return { selectNodeContents() {}, collapse() {} };
  }
  getSelection() {
    return { removeAllRanges() {}, addRange() {} };
  }
  execCommand() {
    return true;
  }
}
export function propertyKey(
  key: string,
  modifiers: Record<string, boolean> = {},
  target?: PropertyElement,
): KeyboardEvent {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, {
    key,
    isComposing: false,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
  });
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  return event as KeyboardEvent;
}
export function installPropertyDOM(t: TestContext): PropertyDocument {
  const document = new PropertyDocument();
  const globals = {
    document,
    HTMLElement: PropertyElement,
    HTMLInputElement: PropertyNativeInput,
    HTMLTextAreaElement: PropertyTextarea,
    Element: PropertyElement,
    CSS: { escape: (text: string) => text },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    });
  }
  return document;
}
