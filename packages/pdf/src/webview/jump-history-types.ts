/** The state the jump history controller (jump-history.ts) works with. */
import type { useZoom } from "@embedpdf/plugin-zoom/react";
import type { ReadingPosition } from "../shared/reading-position";
import type { ViewChoices } from "../shared/view-settings";
import type { Navigation } from "./navigation";

export type Zoom = ReturnType<typeof useZoom>["provides"];

/** What the controller reads from the latest render. */
export interface Dependencies {
  navigation: Navigation;
  choices: ViewChoices;
  setChoices: (choices: ViewChoices) => void;
  zoom: Zoom;
}

/** A deliberate jump, recorded once the viewport has settled. */
export interface PendingJump {
  from: ReadingPosition;
  id: number;
  requestId?: number;
  /** A native precise link waits for the arrival to be acknowledged. */
  acknowledge?: boolean;
  generation?: number;
}

/** A Back or Forward the host asked for, being replayed frame by frame. */
export interface Replay {
  token: number;
  requested: ReadingPosition;
  generation: number;
  frames: number;
  steady: number;
  positioned: boolean;
  previous: ReadingPosition;
}
