/**
 * The text inside a region dragged over a page, in two steps: find the runs
 * of characters whose middle lies in the region (`regionRuns`), then, with
 * their text read, put them line by line from the top and left to right, so a
 * table reads row by row (`regionText`).
 */
import type { PageRect } from './geometry';

/** A character's box; missing for characters PDFium adds, such as line breaks. */
export type CharBox = PageRect | undefined;

/** Consecutive characters on one line, all inside the region. */
export interface CharRun {
  charIndex: number;
  charCount: number;
  rect: PageRect;
}

/** The runs of characters (indexed as on the page) inside a region. */
export function regionRuns(chars: readonly CharBox[], region: PageRect): CharRun[] {
  const runs: CharRun[] = [];
  let run: CharRun | undefined;
  /**
   * The run's first character's top and bottom. Characters on its line
   * overlap it by a third at least (a superscript does); growing it with them
   * could take in the next line.
   */
  let band: [number, number] = [0, 0];
  chars.forEach((box, index) => {
    // A character without a box (a space or line break PDFium added) joins
    // its neighbours only if the run carries on after it.
    if (!box) return;
    const inside = contains(region, box);
    const sameLine = run !== undefined && index === run.charIndex + run.charCount + gap(chars, run, index)
      && overlap(band, box) >= Math.min(band[1] - band[0], box[3] - box[1]) / 3;
    if (inside && run && sameLine) {
      run.charCount = index - run.charIndex + 1;
      run.rect = [Math.min(run.rect[0], box[0]), Math.min(run.rect[1], box[1]), Math.max(run.rect[2], box[2]), Math.max(run.rect[3], box[3])];
      return;
    }
    run = inside ? { charIndex: index, charCount: 1, rect: box } : undefined;
    band = [box[1], box[3]];
    if (run) runs.push(run);
  });
  return runs;
}

/** How many boxless characters lie between the run's end and `index`. */
function gap(chars: readonly CharBox[], run: CharRun, index: number): number {
  let count = 0;
  for (let i = run.charIndex + run.charCount; i < index && !chars[i]; i++) count++;
  return count;
}

function overlap([top, bottom]: [number, number], box: PageRect): number {
  return Math.min(bottom, box[3]) - Math.max(top, box[1]);
}

function contains([left, top, right, bottom]: PageRect, box: PageRect): boolean {
  const x = (box[0] + box[2]) / 2;
  return x >= left && x <= right && middleY(box) >= top && middleY(box) <= bottom;
}

function middleY(box: PageRect): number {
  return (box[1] + box[3]) / 2;
}

export interface TextRun {
  content: string;
  rect: PageRect;
}

export function regionText(runs: readonly TextRun[], [left, top, right, bottom]: PageRect): string {
  const inside = runs.filter(({ content, rect }) => {
    const x = (rect[0] + rect[2]) / 2;
    const y = (rect[1] + rect[3]) / 2;
    return content.trim() !== '' && x >= left && x <= right && y >= top && y <= bottom;
  });
  const byMiddle = [...inside].sort((a, b) => middle(a) - middle(b) || a.rect[0] - b.rect[0]);
  const lines: { runs: TextRun[]; middle: number; height: number }[] = [];
  for (const run of byMiddle) {
    const line = lines.at(-1);
    // Same line: the middles are close for the shorter of the two. A label
    // centred on two table rows gets a line of its own between them.
    if (line && middle(run) - line.middle < SAME_LINE * Math.min(line.height, height(run))) {
      line.runs.push(run);
      line.middle += (middle(run) - line.middle) / line.runs.length;
      line.height = Math.min(line.height, height(run));
    } else {
      lines.push({ runs: [run], middle: middle(run), height: height(run) });
    }
  }
  return lines.map(({ runs }) => joinLine(runs.sort((a, b) => a.rect[0] - b.rect[0]))).join('\n');
}

/**
 * Runs on a line, separated by spaces unless they touch: a subscript split
 * off its word ("P" "drop") joins it again.
 */
function joinLine(runs: readonly TextRun[]): string {
  let text = '';
  runs.forEach((run, index) => {
    const previous = runs[index - 1];
    const touches = previous !== undefined && run.rect[0] - previous.rect[2] < TOUCHING * Math.min(height(run), height(previous));
    text += (previous && !touches ? ' ' : '') + run.content.trim();
  });
  return text.replace(/\s+/gu, ' ');
}

/** Runs are on one line if their middles are within this share of a line's height. */
const SAME_LINE = 0.4;
/** Runs closer than this share of their height touch: no space between them. */
const TOUCHING = 0.15;

function middle(run: TextRun): number {
  return (run.rect[1] + run.rect[3]) / 2;
}

function height(run: TextRun): number {
  return run.rect[3] - run.rect[1];
}
