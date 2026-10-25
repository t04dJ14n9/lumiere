import { createChildEl, createDiv, getDomDocument } from "./dom-helpers";
import type { App } from "./obsidian-workspace";
import {
  ButtonComponent,
  ColorComponent,
  DropdownComponent,
  ExtraButtonComponent,
  MomentFormatComponent,
  ProgressBarComponent,
  SearchComponent,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
  type BaseComponent,
} from "./obsidian-ui";

const ICON_REGISTRY = new Map<string, string>();

export function addIcon(iconId: string, svgContent: string): void {
  ICON_REGISTRY.set(iconId, svgContent);
}

export function getIcon(iconId: string): SVGSVGElement | null {
  const custom = ICON_REGISTRY.get(iconId);
  const doc = getDomDocument();
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("svg-icon", iconId);
  svg.dataset.icon = iconId;
  if (custom) {
    svg.innerHTML = custom;
  } else {
    const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "9");
    svg.appendChild(circle);
  }
  return svg;
}

export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.textContent = "";
  const icon = getIcon(iconId);
  if (icon) {
    parent.appendChild(icon);
  }
}

export function getIconIds(): string[] {
  return [...ICON_REGISTRY.keys()];
}

export function removeIcon(iconId: string): void {
  ICON_REGISTRY.delete(iconId);
}

export function setTooltip(
  el: HTMLElement,
  tooltip: string,
  _options?: { placement?: string; delay?: number },
): void {
  if (tooltip) {
    el.setAttribute("aria-label", tooltip);
    el.setAttribute("title", tooltip);
  } else {
    el.removeAttribute("aria-label");
    el.removeAttribute("title");
  }
}

export function displayTooltip(
  el: HTMLElement,
  content: string | DocumentFragment,
  options?: { placement?: string; delay?: number },
): void {
  const text =
    typeof content === "string" ? content : (content.textContent ?? "");
  setTooltip(el, text, options);
}

export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const doc = getDomDocument();
  const frag = doc.createDocumentFragment();
  const div = doc.createElement("div");
  div.innerHTML = html;
  while (div.firstChild) {
    frag.appendChild(div.firstChild);
  }
  return frag;
}

export function htmlToMarkdown(html: string | HTMLElement): string {
  if (typeof html === "string") {
    return html.replace(/<[^>]*>/g, "");
  }
  return html.textContent ?? "";
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: BaseComponent[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = createChildEl(containerEl, "div", "setting-item");
    this.infoEl = createChildEl(this.settingEl, "div", "setting-item-info");
    this.nameEl = createChildEl(this.infoEl, "div", "setting-item-name");
    this.descEl = createChildEl(this.infoEl, "div", "setting-item-description");
    this.controlEl = createChildEl(
      this.settingEl,
      "div",
      "setting-item-control",
    );
  }

  setName(name: string | DocumentFragment): this {
    this.nameEl.textContent = "";
    if (typeof name === "string") {
      this.nameEl.textContent = name;
    } else {
      this.nameEl.appendChild(name);
    }
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.descEl.textContent = "";
    if (typeof desc === "string") {
      this.descEl.textContent = desc;
    } else {
      this.descEl.appendChild(desc);
    }
    return this;
  }

  setClass(cls: string): this {
    this.settingEl.classList.add(cls);
    return this;
  }

  setTooltip(tooltip: string, options?: { placement?: string }): this {
    setTooltip(this.settingEl, tooltip, options);
    return this;
  }

  setHeading(): this {
    this.settingEl.classList.add("setting-item-heading");
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.settingEl.classList.toggle("is-disabled", disabled);
    for (const comp of this.components) {
      comp.setDisabled(disabled);
    }
    return this;
  }

  addButton(cb: (component: ButtonComponent) => unknown): this {
    const comp = new ButtonComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addExtraButton(cb: (component: ExtraButtonComponent) => unknown): this {
    const comp = new ExtraButtonComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addToggle(cb: (component: ToggleComponent) => unknown): this {
    this.settingEl.classList.add("mod-toggle");
    const comp = new ToggleComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addText(cb: (component: TextComponent) => unknown): this {
    const comp = new TextComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addSearch(cb: (component: SearchComponent) => unknown): this {
    const comp = new SearchComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addTextArea(cb: (component: TextAreaComponent) => unknown): this {
    const comp = new TextAreaComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addMomentFormat(cb: (component: MomentFormatComponent) => unknown): this {
    const comp = new MomentFormatComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addDropdown(cb: (component: DropdownComponent) => unknown): this {
    const comp = new DropdownComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addColorPicker(cb: (component: ColorComponent) => unknown): this {
    const comp = new ColorComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addProgressBar(cb: (component: ProgressBarComponent) => unknown): this {
    const comp = new ProgressBarComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addSlider(cb: (component: SliderComponent) => unknown): this {
    const comp = new SliderComponent(this.controlEl);
    this.components.push(comp);
    cb(comp);
    return this;
  }

  then(cb: (setting: this) => unknown): this {
    cb(this);
    return this;
  }

  clear(): this {
    this.controlEl.textContent = "";
    this.components = [];
    return this;
  }
}

export class SettingTab {
  app: App;
  containerEl: HTMLElement;

  constructor(app: App) {
    this.app = app;
    this.containerEl = createDiv("vertical-tab-content");
  }

  display(): void {}

  hide(): void {
    this.containerEl.textContent = "";
  }
}

export class PluginSettingTab extends SettingTab {
  plugin: unknown;

  constructor(app: App, plugin: unknown) {
    super(app);
    this.plugin = plugin;
  }
}
