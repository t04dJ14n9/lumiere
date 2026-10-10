import type { Frame, Page } from "@playwright/test";

export interface Geometry {
  numbers: { n: string; top: number; bottom: number; textCentre: number }[];
  table: { top: number; bottom: number };
  headerCentre: number;
}

/** Gutter numbers and the first rendered table, measured in the page or webview frame. */
export function geometry(page: Page | Frame): Promise<Geometry> {
  return page.evaluate(() => {
    const centre = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = range.getBoundingClientRect();
      return box.top + box.height / 2;
    };
    const numbers = [
      ...document.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
    ]
      .filter((element) => /^\d+$/.test(element.textContent ?? ""))
      .filter((element) => element.getBoundingClientRect().height > 0)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          n: element.textContent!,
          top: box.top,
          bottom: box.bottom,
          textCentre: centre(element),
        };
      });
    const widget = document.querySelector(".hybrid-table")!;
    const box = widget.getBoundingClientRect();
    return {
      numbers,
      table: { top: box.top, bottom: box.bottom },
      headerCentre: centre(widget.querySelector("th .table-cell-content")!),
    };
  });
}
