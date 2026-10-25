import {
  Pencil,
  ClipboardList,
  Info,
  CircleCheck,
  CircleAlert,
  Flame,
  Check,
  CircleHelp,
  TriangleAlert,
  X,
  Zap,
  Bug,
  List,
  Quote,
  Calendar,
  Binary,
  SquareCheck,
  Clock,
  Tags,
  Forward,
  ChevronRight,
  Text,
  FileQuestion,
  Plus,
  Star,
  Heart,
  Bookmark,
  Lightbulb,
  Terminal,
  Bell,
  Sparkles,
  Rocket,
  ShieldAlert,
  Code,
  Link,
  Hash,
  type IconNode,
} from "lucide";
import {
  inferPropertyKind,
  type PropertyKind,
} from "../../markdown/properties/types";

const calloutIcons: Record<string, IconNode> = {
  note: Pencil,
  abstract: ClipboardList,
  info: Info,
  todo: CircleCheck,
  tip: Flame,
  success: Check,
  question: CircleHelp,
  warning: TriangleAlert,
  failure: X,
  danger: Zap,
  bug: Bug,
  example: List,
  quote: Quote,
};

const customCalloutIcons: Record<string, IconNode> = {
  pencil: Pencil,
  "clipboard-list": ClipboardList,
  info: Info,
  "check-circle-2": CircleCheck,
  "check-circle": CircleCheck,
  "circle-check": CircleCheck,
  "alert-circle": CircleAlert,
  "circle-alert": CircleAlert,
  flame: Flame,
  check: Check,
  "help-circle": CircleHelp,
  "circle-help": CircleHelp,
  "alert-triangle": TriangleAlert,
  "triangle-alert": TriangleAlert,
  x: X,
  zap: Zap,
  bug: Bug,
  list: List,
  quote: Quote,
  calendar: Calendar,
  clock: Clock,
  tags: Tags,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  lightbulb: Lightbulb,
  terminal: Terminal,
  bell: Bell,
  sparkles: Sparkles,
  rocket: Rocket,
  "shield-alert": ShieldAlert,
  code: Code,
  link: Link,
  hash: Hash,
};

// lucide >= 1.0 icon nodes hold only the children; the root <svg> attributes are ours.
const svgAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};
function iconHTML(node: IconNode, cls: string): string {
  const attributes = (
    attrs: Record<string, string | number | undefined>,
  ): string =>
    Object.entries(attrs)
      .filter(([, value]) => value !== undefined)
      .map(
        ([name, value]) =>
          ` ${name}="${String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
      )
      .join("");
  return `<svg${attributes(svgAttributes)} class="${cls}" aria-hidden="true">${node.map(([tag, attrs]) => `<${tag}${attributes(attrs)}/>`).join("")}</svg>`;
}
export function calloutIcon(kind: string): string {
  return iconHTML(calloutIcons[kind] ?? Pencil, "callout-icon");
}
export function resolveCalloutIcon(rawName: string): string | undefined {
  const normalized = rawName
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/^lucide-/, "");
  if (!normalized) {
    return undefined;
  }
  const node = customCalloutIcons[normalized] ?? calloutIcons[normalized];
  if (!node) {
    return undefined;
  }
  return iconHTML(node, "callout-icon").replace(
    "<svg",
    `<svg data-lucide="${normalized}"`,
  );
}
export function propertyIcon(
  name: string,
  value: unknown,
  kind: PropertyKind | "unknown" = inferPropertyKind(name, value),
): string {
  if (kind === "unknown") {
    return iconHTML(FileQuestion, "property-icon").replace(
      "<svg",
      `<svg data-lucide="file-question"`,
    );
  }
  const icons: Record<PropertyKind, [IconNode, string]> = {
    text: [Text, "text"],
    list: [List, "list"],
    number: [Binary, "binary"],
    checkbox: [SquareCheck, "check-square"],
    date: [Calendar, "calendar"],
    datetime: [Clock, "clock"],
    tags: [Tags, "tags"],
    aliases: [Forward, "forward"],
  };
  const [icon, label] = icons[kind];
  return iconHTML(icon, "property-icon").replace(
    "<svg",
    `<svg data-lucide="${label}"`,
  );
}

export function propertyFlairIcon(
  kind: "pencil" | "warning" | "collapse" | "plus",
): string {
  const icons = {
    pencil: Pencil,
    warning: TriangleAlert,
    collapse: ChevronRight,
    plus: Plus,
  };
  const html = iconHTML(icons[kind], "property-icon");
  if (kind === "plus") {
    return html.replace("<svg", `<svg data-lucide="plus"`);
  }
  return html;
}
