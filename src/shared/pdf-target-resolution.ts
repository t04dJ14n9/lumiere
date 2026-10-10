/** Resolve an explicit resource without silently choosing among workspace roots. */
export async function resolvePdfCandidates<T>(
  candidates: readonly T[],
  key: (candidate: T) => string,
  isPdfFile: (candidate: T) => Promise<boolean>,
  choose: (candidates: readonly T[]) => Promise<T | undefined>,
): Promise<{ status: 'found'; target: T } | { status: 'missing' | 'cancelled' }> {
  const unique = [...new Map(candidates.map(candidate => [key(candidate), candidate])).values()];
  const valid: T[] = [];
  for (const candidate of unique) if (await isPdfFile(candidate)) valid.push(candidate);
  if (!valid.length) return { status: 'missing' };
  if (valid.length === 1) return { status: 'found', target: valid[0]! };
  const chosen = await choose(valid);
  if (!chosen) return { status: 'cancelled' };
  const target = valid.find(candidate => key(candidate) === key(chosen));
  // Recheck after an asynchronous picker: the selected file may have moved.
  return target && await isPdfFile(target) ? { status: 'found', target } : { status: 'missing' };
}
