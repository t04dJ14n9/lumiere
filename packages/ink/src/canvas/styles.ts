/**
 * The canvas's looks, set through the CSSOM: windows that host it allow
 * no inline `<style>` (the desktop window's content security policy is
 * `style-src 'self'`), and the canvas ships no stylesheet of its own. It is
 * light in every theme, as sketches are stored drawn on light paper.
 */

export type Style = Partial<CSSStyleDeclaration>;

export function styled<E extends HTMLElement>(element: E, style: Style): E {
  Object.assign(element.style, style);
  return element;
}

export const INK = "#1f2328";
export const MUTED = "#59636e";
export const ACCENT = "#0a64d6";
const BAR = "#f6f8fa";
const BORDER = "#d1d9e0";
/** Behind the canvas, before its first paint. */
const BACKDROP = "#ffffff";

export const dialogStyle: Style = {
  position: "fixed",
  inset: "0",
  width: "100%",
  height: "100%",
  maxWidth: "none",
  maxHeight: "none",
  margin: "0",
  padding: "0",
  border: "none",
  display: "flex",
  flexDirection: "column",
  background: BACKDROP,
  color: INK,
  colorScheme: "light",
  font: "14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif",
  overflow: "hidden",
};

export const headerStyle: Style = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "6px 10px",
  background: BAR,
  borderBottom: `1px solid ${BORDER}`,
  flex: "none",
};

export const titleStyle: Style = {
  flex: "1",
  minWidth: "0",
  textAlign: "center",
  fontWeight: "600",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const buttonStyle: Style = {
  font: "inherit",
  color: ACCENT,
  background: "transparent",
  border: "none",
  borderRadius: "6px",
  padding: "6px 10px",
  cursor: "pointer",
};

export const doneStyle: Style = { ...buttonStyle, fontWeight: "600" };

export const iconButtonStyle: Style = {
  ...buttonStyle,
  padding: "6px",
  lineHeight: "0",
};

export const mainStyle: Style = {
  position: "relative",
  flex: "1",
  minHeight: "0",
};

export const surfaceStyle: Style = {
  position: "absolute",
  inset: "0",
  overflow: "hidden",
  overscrollBehavior: "none",
  touchAction: "none",
  cursor: "crosshair",
  outline: "none",
  userSelect: "none",
  webkitUserSelect: "none",
};

export const layerStyle: Style = {
  position: "absolute",
  left: "0",
  top: "0",
  pointerEvents: "none",
};

export const paletteStyle: Style = {
  position: "absolute",
  // Centred by its margins: with `left: 50%` it could only grow to half the width.
  left: "16px",
  right: "16px",
  bottom: "16px",
  width: "fit-content",
  marginInline: "auto",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  alignItems: "center",
  gap: "6px 14px",
  boxSizing: "border-box",
  padding: "8px 12px",
  background: "#ffffff",
  borderRadius: "14px",
  boxShadow: "0 2px 12px rgba(31, 35, 40, 0.18)",
};

export const groupStyle: Style = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

export function segmentStyle(isChosen: boolean): Style {
  return {
    ...buttonStyle,
    padding: "5px 10px",
    color: isChosen ? "#ffffff" : INK,
    background: isChosen ? ACCENT : "transparent",
  };
}

export function swatchStyle(color: string, isChosen: boolean): Style {
  return {
    width: "22px",
    height: "22px",
    padding: "0",
    borderRadius: "50%",
    border: "2px solid #ffffff",
    background: color,
    boxShadow: isChosen ? `0 0 0 2px ${ACCENT}` : `0 0 0 1px ${BORDER}`,
    cursor: "pointer",
  };
}

export function widthStyle(isChosen: boolean): Style {
  return {
    width: "28px",
    height: "28px",
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    border: "none",
    background: isChosen ? "#ddeafb" : "transparent",
    cursor: "pointer",
  };
}

export function widthDotStyle(diameter: number, color: string): Style {
  return {
    display: "block",
    width: `${diameter}px`,
    height: `${diameter}px`,
    borderRadius: "50%",
    background: color,
  };
}

export const confirmStyle: Style = {
  position: "absolute",
  top: "52px",
  left: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "12px",
  background: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 4px 20px rgba(31, 35, 40, 0.25)",
  zIndex: "1",
};

export const discardStyle: Style = {
  ...buttonStyle,
  color: "#ffffff",
  background: "#d1242f",
  fontWeight: "600",
};

export const keepStyle: Style = {
  ...buttonStyle,
  background: BAR,
  border: `1px solid ${BORDER}`,
};
