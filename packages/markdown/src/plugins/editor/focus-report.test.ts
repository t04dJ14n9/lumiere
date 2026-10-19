import test from "node:test";
import assert from "node:assert/strict";
import { reportWebviewFocus } from "./focus-report";

function fakeWindow(hasFocus: boolean): Window {
  const target = new EventTarget();
  return Object.assign(target, {
    document: { hasFocus: () => hasFocus },
  }) as unknown as Window;
}

test("the webview reports its focus at once and on every change", () => {
  const target = fakeWindow(true);
  const reports: boolean[] = [];
  reportWebviewFocus(target, (hasFocus) => reports.push(hasFocus));
  target.dispatchEvent(new Event("blur"));
  target.dispatchEvent(new Event("focus"));
  assert.deepEqual(reports, [true, false, true]);
});

test("a webview that opens without focus reports so, and stopping ends the reports", () => {
  const target = fakeWindow(false);
  const reports: boolean[] = [];
  const stop = reportWebviewFocus(target, (hasFocus) => reports.push(hasFocus));
  stop();
  target.dispatchEvent(new Event("focus"));
  assert.deepEqual(reports, [false]);
});
