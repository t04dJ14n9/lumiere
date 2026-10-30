/** Load number + content hash the host last delivered; annotation saves use these. */
let current: { load: number; sha256: string } | undefined;

export function rememberAnnotationLoad(load: number, sha256: string): void {
  current = { load, sha256 };
}

export function annotationLoadState():
  | { load: number; sha256: string }
  | undefined {
  return current;
}

export function acceptAnnotationSave(sha256: string): void {
  if (current) {
    current = { ...current, sha256 };
  }
}
