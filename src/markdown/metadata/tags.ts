import { metadata } from "./index";
export function noteTags(source: string): string[] {
  return [...new Set(metadata(source).tags.map((tag) => tag.tag))];
}
