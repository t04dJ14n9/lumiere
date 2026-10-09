import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseViewerMessage } from '../../src/shared/messages';
import {
  pageLabel,
  parsePageInput,
  parseViewerAction,
  parseViewState,
  parseZoomInput,
  zoomLabel,
} from '../../src/shared/view-state';

test('view reports from the viewer are validated and the zoom rounded', () => {
  assert.deepEqual(parseViewerMessage({ type: 'view', view: { page: 4, pageCount: 15, zoomPercent: 163.7, fit: 'width' } }), {
    type: 'view',
    view: { page: 4, pageCount: 15, zoomPercent: 164, fit: 'width' },
  });
  // An unknown fit is no fit.
  assert.deepEqual(parseViewState({ page: 1, pageCount: 1, zoomPercent: 100, fit: 'stretch' }),
    { page: 1, pageCount: 1, zoomPercent: 100, fit: null });
  for (const view of [
    { page: 16, pageCount: 15, zoomPercent: 100 },
    { page: 1.5, pageCount: 15, zoomPercent: 100 },
    { page: -1, pageCount: 15, zoomPercent: 100 },
    { page: 1, pageCount: 15, zoomPercent: 0 },
    { page: 1, pageCount: 15, zoomPercent: Number.NaN },
    { page: 1, pageCount: 15, zoomPercent: '100' },
    { page: 1, pageCount: 15, zoomPercent: 1e9 },
    null,
    'page 1',
  ]) {
    assert.equal(parseViewerMessage({ type: 'view', view }), undefined, JSON.stringify(view));
  }
});

test('actions for the viewer are validated', () => {
  for (const action of ['previousPage', 'nextPage', 'zoomIn', 'zoomOut', 'fitWidth', 'fitPage', 'find'] as const) {
    assert.deepEqual(parseViewerAction({ action, extra: 1 }), { action });
  }
  assert.deepEqual(parseViewerAction({ action: 'goToPage', page: 7 }), { action: 'goToPage', page: 7 });
  assert.deepEqual(parseViewerAction({ action: 'setZoom', percent: 140 }), { action: 'setZoom', percent: 140 });
  for (const action of [
    { action: 'goToPage', page: 0 },
    { action: 'goToPage', page: '7' },
    { action: 'setZoom', percent: -5 },
    { action: 'setZoom', percent: Number.POSITIVE_INFINITY },
    { action: 'print' },
    { action: 42 },
    undefined,
  ]) {
    assert.equal(parseViewerAction(action), undefined, JSON.stringify(action));
  }
});

test('a typed page is a whole number, clamped to the document', () => {
  assert.equal(parsePageInput('7', 12), 7);
  assert.equal(parsePageInput(' 7 ', 12), 7);
  assert.equal(parsePageInput('0', 12), 1);
  assert.equal(parsePageInput('99', 12), 12);
  for (const text of ['', 'seven', '7.5', '-3', '1e3', '7 8']) assert.equal(parsePageInput(text, 12), undefined, text);
  assert.equal(parsePageInput('1', 0), undefined);
});

test('a typed zoom takes an optional percent sign and is clamped to the zoom range', () => {
  assert.equal(parseZoomInput('140'), 140);
  assert.equal(parseZoomInput('140%'), 140);
  assert.equal(parseZoomInput(' 62.5 % '), 62.5);
  assert.equal(parseZoomInput('5'), 25);
  assert.equal(parseZoomInput('900'), 400);
  for (const text of ['', '0', 'fit', '-50', '50%%', '1,5']) assert.equal(parseZoomInput(text), undefined, text);
});

test('the status bar labels name the page and the zoom or fit', () => {
  const view = { page: 4, pageCount: 15, zoomPercent: 164, fit: null };
  assert.equal(pageLabel(view), 'Page 4 / 15');
  assert.equal(zoomLabel(view), '164%');
  assert.equal(zoomLabel({ ...view, fit: 'width' }), 'Fit Width (164%)');
  assert.equal(zoomLabel({ ...view, fit: 'page' }), 'Fit Page (164%)');
});
