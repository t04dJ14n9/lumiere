/** Yielding helpers for vault indexing so long vaults stay responsive. */
const SLICE_MS = 8;

/** Wait for `work` up to `budgetMs`, then let it continue in the background. */
export function waitUpTo(work: Promise<void>, budgetMs: number): Promise<void> {
  if (budgetMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, budgetMs);
    void work.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Run `step` over items, yielding to other events every few milliseconds. */
export async function inSlices<T>(
  items: readonly T[],
  step: (item: T) => void,
): Promise<void> {
  let sliceStart = Date.now();
  for (const item of items) {
    step(item);
    if (Date.now() - sliceStart > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStart = Date.now();
    }
  }
}

/** Run `step` over slices of items within `SLICE_MS`, yielding between slices. */
export async function inSlicesBatch<T>(
  items: readonly T[],
  step: (batch: readonly T[]) => void,
): Promise<void> {
  const chunkSize = 512;
  let sliceStart = Date.now();
  for (let i = 0; i < items.length; i += chunkSize) {
    step(items.slice(i, i + chunkSize));
    if (Date.now() - sliceStart > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStart = Date.now();
    }
  }
}
