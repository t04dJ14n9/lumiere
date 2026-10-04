import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PdfActionType, PdfZoomMode, type PdfBookmarkObject, type PdfDestinationObject } from '@embedpdf/models';
import { targetPage, targetUrl, toOutline } from '../../src/webview/pdf-targets';

const destination = (pageIndex: number): PdfDestinationObject => ({ pageIndex, zoom: { mode: PdfZoomMode.Unknown }, view: [] });

test('bookmarks become outline entries with 1-based pages', () => {
  const bookmarks: PdfBookmarkObject[] = [{
    title: 'Part One',
    target: { type: 'destination', destination: destination(0) },
    children: [{ title: 'Web', target: { type: 'action', action: { type: PdfActionType.URI, uri: 'https://example.com' } } }],
  }];
  assert.deepEqual(toOutline(bookmarks), [{
    title: 'Part One',
    page: 1,
    children: [{ title: 'Web', children: [] }],
  }]);
});

test('links resolve to a page or a web address', () => {
  assert.equal(targetPage({ type: 'action', action: { type: PdfActionType.Goto, destination: destination(4) } }), 5);
  assert.equal(targetPage(undefined), undefined);
  assert.equal(targetUrl({ type: 'action', action: { type: PdfActionType.URI, uri: 'https://example.com' } }), 'https://example.com');
  assert.equal(targetUrl({ type: 'destination', destination: destination(1) }), undefined);
});
