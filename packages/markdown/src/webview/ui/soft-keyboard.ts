/**
 * Whether focusing the editor from code brings up the on-screen keyboard. On
 * a touch-only device (an iPad or tablet with no trackpad or mouse) it does,
 * and the keyboard covers half the note, so the editor waits for a tap there
 * before it takes focus. With a trackpad or mouse attached, as on a computer,
 * the editor takes focus as before, ready for the keyboard.
 */
export function focusOpensKeyboard(
  win: Pick<Window, "matchMedia"> = window,
): boolean {
  return (
    win.matchMedia("(pointer: coarse)").matches &&
    !win.matchMedia("(any-pointer: fine)").matches
  );
}
