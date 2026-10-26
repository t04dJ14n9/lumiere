/** The window's entry when a Lumière server serves it: index.html loads this module. */
import { httpBackend } from "./http-backend";
import { startWindow } from "./window";

startWindow(document.getElementById("root")!, httpBackend());
