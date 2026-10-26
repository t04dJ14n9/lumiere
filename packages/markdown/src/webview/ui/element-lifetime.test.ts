import assert from "node:assert/strict";
import test from "node:test";
import { destroyElement, untilDestroyed } from "./element-lifetime";

test("an element's cleanup runs once, whoever destroys it", () => {
  const element = {} as Element;
  let runs = 0;
  untilDestroyed(element, () => runs++);
  destroyElement(element);
  destroyElement(element);
  assert.equal(runs, 1);
});

test("mounting an element again replaces its cleanup", () => {
  const element = {} as Element;
  const ran: string[] = [];
  untilDestroyed(element, () => ran.push("first"));
  untilDestroyed(element, () => ran.push("second"));
  destroyElement(element);
  assert.deepEqual(ran, ["second"]);
});
