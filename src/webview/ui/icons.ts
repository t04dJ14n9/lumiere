import {
  Pencil,
  ClipboardList,
  Info,
  CircleCheck,
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
function iconHTML(node: IconNode, cls: string): string {
  const attributes = (attrs: Record<string, string | number>): string =>
    Object.entries(attrs)
      .map(
        ([name, value]) =>
          ` ${name}="${String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
      )
      .join("");
  return `<svg${attributes(node[1])} class="${cls}" aria-hidden="true">${(node[2] ?? []).map(([tag, attrs]) => `<${tag}${attributes(attrs)}/>`).join("")}</svg>`;
}
export function calloutIcon(kind: string): string {
  return iconHTML(calloutIcons[kind] ?? Info, "callout-icon");
}
export function propertyIcon(
  name: string,
  value: unknown,
  kind = inferPropertyKind(name, value),
): string {
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
  kind: "pencil" | "warning" | "collapse",
): string {
  const icons = {
    pencil: Pencil,
    warning: TriangleAlert,
    collapse: ChevronRight,
  };
  return iconHTML(icons[kind], "property-icon");
}
