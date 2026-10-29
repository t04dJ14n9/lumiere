/**
 * Whether focusing the editor from code brings up the on-screen keyboard. On
 * a touch-first device (an iPad or tablet) it does, and the keyboard covers
 * half the note, so the editor waits for a tap there before it takes focus.
 * Elsewhere, as on a computer, the editor takes focus as before, ready for
 * the keyboard.
 *
 * Only the primary pointer tells: on an iPad a paired Apple Pencil makes
 * `any-pointer: fine` and `any-hover: hover` match, as a trackpad does, yet
 * the on-screen keyboard still comes up.
 */
export function focusOpensKeyboard(
  win: Pick<Window, "matchMedia"> = window,
): boolean {
  return win.matchMedia("(pointer: coarse)").matches;
}
