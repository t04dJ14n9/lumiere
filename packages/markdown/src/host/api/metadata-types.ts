/** Index coordinates use LF-normalized UTF-16 offsets and zero-based lines/columns. */
export interface SourcePosition {
  readonly line: number;
  readonly col: number;
  readonly offset: number;
}
export interface Position {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}
export interface Positioned {
  readonly position: Position;
}
export interface LinkMetadata extends Positioned {
  readonly link: string;
  readonly original: string;
  readonly displayText?: string;
}
export interface TagMetadata extends Positioned {
  readonly tag: string;
}
export interface BlockMetadata extends Positioned {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}
export interface HeadingMetadata extends Positioned {
  readonly from: number;
  readonly to: number;
  readonly end: number;
  readonly level: number;
  readonly label: string;
  readonly key: string;
  readonly scope: string;
  readonly heading: string;
}
export interface FootnoteMetadata {
  readonly label: string;
  readonly from: number;
  readonly marker: number;
  readonly to: number;
  readonly text: string;
  readonly number?: number;
  readonly references: readonly number[];
  readonly segments?: readonly {
    readonly from: number;
    readonly to: number;
    readonly offset: number;
  }[];
}
export interface NoteMetadata {
  readonly links: readonly LinkMetadata[];
  readonly embeds: readonly LinkMetadata[];
  readonly tags: readonly TagMetadata[];
  readonly headings: readonly HeadingMetadata[];
  readonly sections: readonly (Positioned & { readonly type: string })[];
  readonly blocks: Readonly<Record<string, BlockMetadata>>;
  readonly footnotes: {
    readonly definitions: readonly FootnoteMetadata[];
    readonly references: ReadonlyMap<number, FootnoteMetadata>;
  };
  readonly listItems: readonly (Positioned & {
    readonly task?: string;
    readonly parent: number;
  })[];
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly frontmatterLinks: readonly (LinkMetadata & {
    readonly key: string;
  })[];
  readonly aliases: readonly string[];
}
