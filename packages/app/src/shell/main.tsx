/** The window's entry when a Lumière server serves it: index.html loads this module. */
import { webInk } from "@workshop/ink/canvas";
import { httpInk } from "./api";
import { httpBackend } from "./http-backend";
import { drawForServer } from "./ink";
import { startWindow } from "./window";

startWindow(document.getElementById("root")!, httpBackend());
// The server's plugins draw on this window's canvas.
drawForServer({
  server: httpInk,
  canvas: webInk(),
  warn: (message, error) => console.warn(message, error),
});
