import { restoredZoomReady } from "../shared/restored-zoom";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import type { HostMessage } from '../shared/messages';
import type { ReadingPosition } from '../shared/reading-position';
import { samePosition } from '../shared/pdf-history';
import type { ViewChoices } from '../shared/view-settings';
import { postToHost } from './host';
import type { Navigation } from './navigation';
import { DOCUMENT_ID } from './plugins';
import { nativeZoom, rememberedPosition } from './reading-position';

/** The viewer reports discrete jumps; the authoritative stack lives in the host. */
export function useJumpHistory(navigation: Navigation, choices: ViewChoices, setChoices: (choices: ViewChoices) => void) {
  const { provides: zoom } = useZoom(DOCUMENT_ID);
  const latest = useRef({ navigation, choices, setChoices, zoom });
  latest.current = { navigation, choices, setChoices, zoom };
  const sequence = useRef(0);
  const startedToken = useRef(0);
  const frame = useRef<number | undefined>(undefined);
  const pending = useRef<{ from: ReadingPosition; id: number; requestId?: number; acknowledge?: boolean; generation?: number } | undefined>(undefined);
  const previewOrigin = useRef<{ position: ReadingPosition; readerRevision: number } | undefined>(undefined);
  const restoring = useRef<{ token: number; generation: number } | undefined>(undefined);
  const [state, setState] = useState({ back: false, forward: false });

  const snapshot = useCallback((): ReadingPosition => {
    const { choices, zoom } = latest.current;
    const result = { ...rememberedPosition(), ...choices };
    const zoomState = zoom?.getState();
    if (zoomState) result.zoom = zoomState.zoomLevel === ZoomMode.FitWidth ? 'fitWidth'
      : zoomState.zoomLevel === ZoomMode.FitPage ? 'fitPage' : zoomState.currentZoomLevel * 100;
    const viewport = document.querySelector('.viewport')?.getBoundingClientRect();
    if (!viewport) return result;
    for (const page of document.querySelectorAll<HTMLElement>('.page[data-page-index]')) {
      const box = page.getBoundingClientRect();
      if (box.bottom <= viewport.top || box.top >= viewport.bottom || box.right <= viewport.left || box.left >= viewport.right) continue;
      const scale = Number(page.dataset.scale);
      if (!(scale > 0)) continue;
      result.page = Number(page.dataset.pageIndex) + 1;
      result.top = Math.max(0, viewport.top - box.top) / scale;
      result.left = Math.max(0, viewport.left - box.left) / scale;
      break;
    }
    return result;
  }, []);

  const clearFrame = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);
  const finishJump = useCallback((applied = false) => {
    const jump = pending.current;
    if (!jump) return;
    pending.current = undefined;
    clearFrame();
    const { acknowledge, generation, ...entry } = jump;
    postToHost({ type: 'historyJump', ...entry, to: snapshot() });
    if (acknowledge && entry.requestId !== undefined) {
      const intent = latest.current.navigation.intent;
      postToHost({ type: 'historyRestored', token: entry.requestId, position: snapshot(), intent: intent.current(), ok: applied && generation !== undefined && intent.owns(generation) });
    }
  }, [clearFrame, snapshot]);
  const cancelRestore = useCallback(() => {
    const restore = restoring.current;
    if (!restore) return;
    restoring.current = undefined;
    clearFrame();
    postToHost({ type: 'historyRestored', token: restore.token, position: snapshot(), intent: latest.current.navigation.intent.current(), ok: false });
  }, [clearFrame, snapshot]);

  const endPreview = useCallback(() => { previewOrigin.current = undefined; }, []);
  const preview = useCallback((run: () => void) => {
    finishJump();
    cancelRestore();
    const intent = latest.current.navigation.intent;
    if (previewOrigin.current?.readerRevision !== intent.readerRevision())
      previewOrigin.current = { position: snapshot(), readerRevision: intent.readerRevision() };
    intent.advance();
    run();
  }, [cancelRestore, finishJump, snapshot]);

  const jump = useCallback((run: () => void, requestId?: number, acceptPreview = false, expectedIntent?: number) => {
    const admission = latest.current.navigation.intent;
    if (expectedIntent !== undefined && !admission.owns(expectedIntent)) {
      if (requestId !== undefined) postToHost({ type: 'historyRestored', token: requestId, position: snapshot(), intent: admission.current(), ok: false });
      return;
    }
    finishJump();
    cancelRestore();
    const intent = latest.current.navigation.intent;
    const from = acceptPreview && previewOrigin.current?.readerRevision === intent.readerRevision()
      ? previewOrigin.current.position : snapshot();
    previewOrigin.current = undefined;
    const generation = intent.advance();
    pending.current = { from, id: ++sequence.current, ...(requestId === undefined ? {} : { requestId }), ...(expectedIntent === undefined ? {} : { acknowledge: true, generation }) };
    run();
    let previous = snapshot();
    let steady = 0;
    let frames = 0;
    const settle = (): void => {
      if (!pending.current) return;
      const position = snapshot();
      steady = samePosition(previous, position) ? steady + 1 : 0;
      previous = position;
      frames++;
      const settled = latest.current.navigation.isReady() && frames > 6 && steady >= 4;
      if (!intent.owns(generation) || settled || frames >= 180) {
        finishJump(settled && intent.owns(generation));
        return;
      }
      frame.current = requestAnimationFrame(settle);
    };
    frame.current = requestAnimationFrame(settle);
  }, [cancelRestore, finishJump, snapshot]);

  const handle = useCallback((message: Exclude<HostMessage, { type: 'load' }>): boolean => {
    if (message.type === 'historyState') {
      setState({ back: message.back, forward: message.forward });
      return true;
    }
    if (message.type === 'historyCancel') {
      if (message.token !== undefined && restoring.current?.token !== message.token) return true;
      previewOrigin.current = undefined;
      latest.current.navigation.intent.advance();
      cancelRestore();
      return true;
    }
    if (message.type === 'historyCapture') {
      finishJump();
      previewOrigin.current = undefined;
      postToHost({ type: 'historyCaptured', token: message.token, startedToken: startedToken.current, position: snapshot(), intent: latest.current.navigation.intent.current(), ok: true });
      return true;
    }
    if (message.type !== 'historyRestore') return false;
    // Input can occur during capture -> host -> restore IPC, before a local
    // restoration loop even exists. Never revive that stale request.
    if (!latest.current.navigation.intent.owns(message.expectedIntent)) {
      postToHost({ type: 'historyRestored', token: message.token, position: snapshot(), intent: latest.current.navigation.intent.current(), ok: false });
      return true;
    }
    finishJump();
    cancelRestore();
    previewOrigin.current = undefined;
    const intent = latest.current.navigation.intent;
    let generation = intent.advance();
    restoring.current = { token: message.token, generation };
    startedToken.current = message.token;
    const requested = message.position;
    latest.current.setChoices({ pageLayout: requested.pageLayout, scrollMode: requested.scrollMode, scrollDirection: requested.scrollDirection });
    let frames = 0;
    let steady = 0;
    let positioned = false;
    let previous = snapshot();
    const settle = (): void => {
      if (restoring.current?.token !== message.token) return;
      if (!intent.owns(generation) || ++frames > 180) {
        cancelRestore();
        return;
      }
      const { navigation, choices, zoom } = latest.current;
      const position = { ...requested, page: Math.min(requested.page, navigation.pageCount) };
      if (!navigation.isReady() || !zoom || navigation.pageCount < 1) {
        frame.current = requestAnimationFrame(settle);
        return;
      }
      const native = nativeZoom(position.zoom);
      const current = zoom.getState();
      const zoomReady = typeof native === 'number' ? restoredZoomReady(navigation.isReady(), current.zoomLevel, current.currentZoomLevel, native) : current.zoomLevel === native;
      const choicesReady = choices.pageLayout === position.pageLayout && choices.scrollMode === position.scrollMode && choices.scrollDirection === position.scrollDirection;
      if (!zoomReady) {
        // Check ownership immediately before every deferred viewport mutation.
        if (intent.owns(generation)) zoom.requestZoom(native);
        steady = 0;
      } else if (choicesReady && !positioned && frames >= 3) {
        if (intent.owns(generation)) {
          navigation.restore(position);
          // Position restoration supersedes zoom's deferred anchor correction.
          generation = intent.current();
          if (restoring.current) restoring.current.generation = generation;
        }
        positioned = true;
        steady = 0;
      } else if (positioned) {
        const actual = snapshot();
        steady = samePosition(previous, actual) ? steady + 1 : 0;
        previous = actual;
        if (steady >= 4) {
          restoring.current = undefined;
          frame.current = undefined;
          postToHost({ type: 'historyRestored', token: message.token, position: actual, intent: generation, ok: true });
          return;
        }
      }
      frame.current = requestAnimationFrame(settle);
    };
    frame.current = requestAnimationFrame(settle);
    return true;
  }, [cancelRestore, finishJump, snapshot]);

  useEffect(() => () => {
    latest.current.navigation.intent.advance();
    clearFrame();
    pending.current = undefined;
    previewOrigin.current = undefined;
    restoring.current = undefined;
  }, [clearFrame]);

  const traverse = (direction: 'back' | 'forward'): void => {
    finishJump();
    postToHost({ type: 'historyTraverse', direction });
  };
  return { jump, preview, endPreview, handle, back: state.back, forward: state.forward, onBack: () => traverse('back'), onForward: () => traverse('forward') };
}
