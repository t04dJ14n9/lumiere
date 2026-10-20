/** Resolve a search result path to a vault open call. */
export function resolveSearchOpen(
  vault: { file(path: string): { uri: string } | undefined },
  target: { path: string; offset?: number; side?: boolean },
): { uri: string; options: { offset?: number; side?: boolean } } | undefined {
  const file = vault.file(target.path);
  if (!file) {
    return undefined;
  }
  return {
    uri: file.uri,
    options: {
      ...(target.offset !== undefined ? { offset: target.offset } : {}),
      ...(target.side ? { side: true } : {}),
    },
  };
}
