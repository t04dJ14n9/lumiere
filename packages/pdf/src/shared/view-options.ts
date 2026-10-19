import type { PageLayout, ScrollDirection, ScrollMode } from "./view-settings";

export const PAGE_LAYOUTS: {
  value: PageLayout;
  label: string;
  command: string;
}[] = [
  { value: "single", label: "Single page", command: "singlePage" },
  { value: "spread", label: "Two pages (1–2, 3–4)", command: "twoPageSpread" },
  {
    value: "spreadCover",
    label: "Two pages with cover (1, 2–3)",
    command: "twoPageCover",
  },
];
export const SCROLL_MODES: {
  value: ScrollMode;
  label: string;
  command: string;
}[] = [
  { value: "continuous", label: "Continuous", command: "continuousScroll" },
  { value: "paged", label: "Page-by-page", command: "pageByPage" },
];
export const SCROLL_DIRECTIONS: {
  value: ScrollDirection;
  label: string;
  command: string;
}[] = [
  { value: "vertical", label: "Vertical", command: "verticalScroll" },
  { value: "horizontal", label: "Horizontal", command: "horizontalScroll" },
];
