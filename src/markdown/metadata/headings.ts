import { metadata } from "./index";
export interface NoteHeading {
  from: number;
  to: number;
  level: number;
  title: string;
}
export function noteHeadings(source: string): NoteHeading[] {
  return metadata(source).headings.map((h) => ({
    from: h.from,
    to: h.to,
    level: h.level,
    title: h.heading,
  }));
}
export function headings(source: string) {
  return metadata(source).headings;
}
