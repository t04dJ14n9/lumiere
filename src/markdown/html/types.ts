export interface RenderOptions {
  /** Fragments retain leading thematic breaks; only whole documents have properties. */
  fragment?: boolean;
  /** Definitions parsed separately into a fresh parser environment. */
  referenceDefinitions?: string;
  strictLineBreaks?: boolean;
  sanitize?: (html: string) => string;
  source?: string;
  docId?: string;
}
export interface RendererOptions {
  strictLineBreaks?: boolean;
  calloutIcon?: (kind: string) => string;
}
