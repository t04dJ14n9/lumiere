export interface RenderOptions {
  strictLineBreaks?: boolean;
  sanitize?: (html: string) => string;
  source?: string;
  docId?: string;
}
export interface RendererOptions {
  strictLineBreaks?: boolean;
  calloutIcon?: (kind: string) => string;
}
