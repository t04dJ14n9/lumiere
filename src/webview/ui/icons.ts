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
  Hash,
  Tag,
  ListFilter,
  Text,
  type IconNode,
} from "lucide";
import { inferPropertyKind, type PropertyKind } from "../../markdown/properties/types";

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
  const icons: Record<PropertyKind, IconNode> = {
    text: Text,
    list: ListFilter,
    number: Hash,
    checkbox: CircleCheck,
    date: Calendar,
    datetime: Calendar,
    tags: Tag,
  };
  const icon = icons[kind];
  return iconHTML(icon, "property-icon");
}
