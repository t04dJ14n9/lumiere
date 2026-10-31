/** Whether Delete/Backspace should remove selected annotations (Annotate mode). */
export function shouldDeleteAnnotationOnKey(options: {
  key: string;
  annotate: boolean;
  hasAnnotationSelection: boolean;
  editable: boolean;
}): boolean {
  if (
    options.editable ||
    !options.annotate ||
    !options.hasAnnotationSelection
  ) {
    return false;
  }
  return options.key === "Delete" || options.key === "Backspace";
}
