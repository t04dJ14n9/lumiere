import React, { useEffect, useRef, useState } from 'react';
import { nearestDock, type FloatingDock } from '../shared/toolbar-settings';
import { postToHost } from './host';
import { ToolbarControls, type ToolbarProps } from './toolbar';

/** Fade the bar out this long after the pointer last moved, while reading. */
const IDLE_MS = 2_000;

/** Arrow keys on the grip move the bar to that edge. */
const ARROW_DOCKS: Record<string, FloatingDock> = {
  ArrowUp: 'top',
  ArrowDown: 'bottom',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * The controls in a bar floating over the pages (`toolbar.mode`:
 * `floating`), docked to the middle of an edge: horizontal at the top or
 * bottom, vertical at the left or right. Drag its grip to another edge, or
 * focus the grip and press an arrow key; the extension remembers the edge
 * for every PDF. The bar fades while the pointer rests, and comes back when
 * it moves or a control has focus.
 */
export function FloatingToolbar({ dock, onDock, zen, ...controls }: ToolbarProps & {
  /** Zen mode is on: the bar is the only controls there are, with a way out. */
  zen: boolean;
  dock: FloatingDock;
  /** The reader moved the bar to another edge. */
  onDock: (dock: FloatingDock) => void;
}): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null);
  const awake = useAwake(bar);
  /** While dragging: where the pointer is in the document area, and the edge it would dock to. */
  const [drag, setDrag] = useState<{ x: number; y: number; target: FloatingDock } | undefined>();

  const moveTo = (next: FloatingDock): void => {
    if (next === dock) return;
    onDock(next);
    postToHost({ type: 'floatingDock', dock: next });
  };

  const area = (): DOMRect => bar.current!.parentElement!.getBoundingClientRect();
  const track = (event: React.PointerEvent): { x: number; y: number; target: FloatingDock } => {
    const box = area();
    const x = Math.min(Math.max(0, event.clientX - box.left), box.width);
    const y = Math.min(Math.max(0, event.clientY - box.top), box.height);
    return { x, y, target: nearestDock(x, y, box.width, box.height) };
  };

  const vertical = dock === 'left' || dock === 'right';
  const classes = [
    'floating-toolbar',
    `dock-${dock}`,
    vertical ? 'vertical' : 'horizontal',
    awake || drag ? '' : 'asleep',
    drag ? 'dragging' : '',
  ].filter(Boolean).join(' ');
  return (
    <>
      {drag && <div className={`dock-target dock-target-${drag.target}`} aria-hidden="true" />}
      <div
        ref={bar}
        className={classes}
        role="toolbar"
        aria-label="PDF toolbar"
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        style={drag ? { left: drag.x, top: drag.y } : undefined}
      >
        <button
          type="button"
          className="grip"
          aria-label={`Move toolbar (now at the ${dock}); drag to an edge or press an arrow key`}
          title="Drag to another edge"
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag(track(event));
          }}
          onPointerMove={event => {
            if (drag) setDrag(track(event));
          }}
          onPointerUp={event => {
            if (!drag) return;
            setDrag(undefined);
            moveTo(track(event).target);
          }}
          onPointerCancel={() => setDrag(undefined)}
          onKeyDown={event => {
            const target = ARROW_DOCKS[event.key];
            if (!target) return;
            event.preventDefault();
            moveTo(target);
          }}
        >
          <i className="codicon codicon-gripper" aria-hidden="true" />
        </button>
        <ToolbarControls {...controls} compact />
        {zen && (
          <>
            <span className="separator" />
            <button
              type="button"
              className="icon-button exit-zen"
              aria-label="Exit zen mode"
              title="Exit zen mode (Esc Esc)"
              onClick={() => postToHost({ type: 'zen', exit: true })}
            >
              <i className="codicon codicon-screen-normal" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Whether the bar should show: for a while after the pointer moves over the
 * viewer, and while the pointer is over the bar or a control has keyboard
 * focus.
 */
function useAwake(bar: React.RefObject<HTMLDivElement | null>): boolean {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer: number | undefined;
    const rest = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Keyboard focus keeps it; a clicked button keeps focus too, but not this.
        if (bar.current?.matches(':hover, :has(:focus-visible)')) rest();
        else setAwake(false);
      }, IDLE_MS);
    };
    const wake = (): void => {
      setAwake(true);
      rest();
    };
    rest();
    document.addEventListener('pointermove', wake);
    document.addEventListener('focusin', wake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointermove', wake);
      document.removeEventListener('focusin', wake);
    };
  }, [bar]);
  return awake;
}

