/**
 * The buttons at the end of the tab strip, as VS Code puts them in its title
 * bar: show or hide the files sidebar and the outline, open the Command
 * Palette, and open Settings.
 */
import type { UiStateHandle } from "../ui-state";

export interface LayoutButtonsProps {
  readonly ui: UiStateHandle;
  readonly onSettings: () => void;
  readonly onCommandPalette?: (() => void) | undefined;
}

export function LayoutButtons({
  ui,
  onSettings,
  onCommandPalette,
}: LayoutButtonsProps) {
  const { sidebar, outline } = ui.state;
  return (
    <div className="layout-buttons">
      {onCommandPalette && (
        <button
          type="button"
          title="Command Palette (⇧⌘P)"
          aria-label="Command Palette"
          onClick={onCommandPalette}
        >
          <CommandIcon />
        </button>
      )}
      <button
        type="button"
        title="Toggle Sidebar (⌘B)"
        aria-label="Toggle Sidebar"
        aria-pressed={sidebar}
        onClick={() => ui.update({ sidebar: !sidebar })}
      >
        <PanelIcon side="left" filled={sidebar} />
      </button>
      <button
        type="button"
        title="Toggle Outline (⌥⌘B)"
        aria-label="Toggle Outline"
        aria-pressed={outline}
        onClick={() => ui.update({ outline: !outline })}
      >
        <PanelIcon side="right" filled={outline} />
      </button>
      <button
        type="button"
        title="Settings (⌘,)"
        aria-label="Settings"
        onClick={onSettings}
      >
        <GearIcon />
      </button>
    </div>
  );
}

function CommandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 4.5l3.5 3.5L3 11.5M8 11.5h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelIcon({
  side,
  filled,
}: {
  readonly side: "left" | "right";
  readonly filled: boolean;
}) {
  const x = side === "left" ? 2 : 10;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
      />
      <rect
        x={x}
        y="3"
        width="4"
        height="10"
        fill={filled ? "currentColor" : "none"}
        opacity="0.55"
      />
      <line
        x1={side === "left" ? 6 : 10}
        y1="2.5"
        x2={side === "left" ? 6 : 10}
        y2="13.5"
        stroke="currentColor"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}
