/** Asset promises are shared by aliases and concurrent source/rendered fences. */
export function createLanguageLoader(
  loaders: ReadonlyMap<string, () => Promise<unknown>>,
  aliases: ReadonlyMap<string, string>,
): (language: string) => Promise<void> {
  const pending = new Map<string, Promise<void>>();
  return (language) => {
    const id = aliases.get(language) ?? language;
    const loader = loaders.get(id);
    if (!loader) {
      return Promise.resolve();
    }
    let promise = pending.get(id);
    if (!promise) {
      promise = loader()
        .then(() => undefined)
        .catch((error: unknown) => {
          pending.delete(id);
          throw error;
        });
      pending.set(id, promise);
    }
    return promise;
  };
}
