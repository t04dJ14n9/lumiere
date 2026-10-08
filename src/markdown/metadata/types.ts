import type { Footnotes } from "./footnote-extract";
import type { Heading } from "./heading-extract";
export interface SourcePosition {
  line: number;
  col: number;
  offset: number;
}
export interface Position {
  start: SourcePosition;
  end: SourcePosition;
}
export interface Positioned {
  position: Position;
}
export interface LinkMetadata extends Positioned {
  link: string;
  original: string;
  displayText?: string;
}
export interface TagMetadata extends Positioned {
  tag: string;
}
export interface BlockMetadata extends Positioned {
  id: string;
  from: number;
  to: number;
  text: string;
}
export interface NoteMetadata {
  links: LinkMetadata[];
  embeds: LinkMetadata[];
  tags: TagMetadata[];
  headings: (Heading & Positioned & { heading: string })[];
  sections: (Positioned & { type: string })[];
  blocks: Record<string, BlockMetadata>;
  footnotes: Footnotes;
  listItems: (Positioned & { task?: string; parent: number })[];
  frontmatter?: Record<string, unknown>;
  frontmatterLinks: (LinkMetadata & { key: string })[];
  aliases: string[];
}
