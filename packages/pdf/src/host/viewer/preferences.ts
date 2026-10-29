import type { PdfConfiguration, PdfState } from "../../shared/host";
import {
  parseSavedPosition,
  savedPosition,
  type ReadingPosition,
} from "../../shared/reading-position";
import {
  parseViewSettings,
  resolveSmoothScrolling,
  type ViewSettings,
} from "../../shared/view-settings";
import type { PdfViewerPanel } from "./panel";

const SECTION = "lumiere.pdf.view";
const EDITOR_SMOOTH_SCROLLING = "editor.smoothScrolling";

/** Defaults for new views; saved positions are read once, independently by each panel. */
export class PdfViewPreferences {
  private readonly stop: () => void;

  constructor(
    private readonly configuration: PdfConfiguration,
    private readonly state: PdfState,
    panels: { readonly all: readonly PdfViewerPanel[] },
  ) {
    this.stop = configuration.onChange((affects) => {
      if (!affects(SECTION) && !affects(EDITOR_SMOOTH_SCROLLING)) {
        return;
      }
      for (const panel of panels.all) {
        panel.setViewSettings(this.settings(panel.fileUri));
      }
    });
  }

  /** The view settings for the PDF at `uri`. */
  settings(uri: string): ViewSettings {
    const view = (key: string) =>
      this.configuration.get(`${SECTION}.${key}`, uri);
    const settings = parseViewSettings({
      defaultZoom: view("defaultZoom"),
      pageLayout: view("pageLayout"),
      scrollMode: view("scrollMode"),
      scrollDirection: view("scrollDirection"),
      smoothScrolling: view("smoothScrolling"),
    });
    settings.smoothScrolling = resolveSmoothScrolling(
      settings.smoothScrolling,
      this.configuration.get(EDITOR_SMOOTH_SCROLLING, uri),
      false,
    );
    return settings;
  }

  /** Where the PDF at `uri` was left, unless the reader turned that off. */
  position(uri: string): ReadingPosition | undefined {
    const restore =
      this.configuration.get(`${SECTION}.restoreOnReopen`, uri) ?? true;
    if (!restore) {
      return undefined;
    }
    return parseSavedPosition(this.state.get(positionKey(uri)));
  }

  save(uri: string, position: ReadingPosition): void {
    // Detached storage work has an error sink; open panels never follow this saved value.
    void this.state
      .update(positionKey(uri), savedPosition(position))
      .catch((error: unknown) =>
        console.error("Could not save PDF view", error),
      );
  }

  dispose(): void {
    this.stop();
  }
}

function positionKey(uri: string): string {
  return `lumiere.pdf.readingPosition:${uri}`;
}
