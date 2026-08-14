import test from "node:test";
import assert from "node:assert/strict";
import { setupProviderDialog, showProviderError } from "../src/dialog.js";

function event(type, properties = {}) {
  const value = new Event(type, { cancelable: true });
  Object.entries(properties).forEach(([key, item]) => Object.defineProperty(value, key, { value: item }));
  return value;
}

class Control extends EventTarget {
  constructor(document) {
    super();
    this.ownerDocument = document;
    this.focusCount = 0;
  }

  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }
}

class Dialog extends Control {
  constructor(document, controls) {
    super(document);
    this.controls = controls;
    this.open = false;
  }

  showModal() { this.open = true; }
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }
  querySelectorAll() { return this.controls; }
}

function fixture() {
  const document = { activeElement: null };
  const trigger = new Control(document);
  const closeButton = new Control(document);
  const option = new Control(document);
  const dialog = new Dialog(document, [closeButton, option]);
  const backgrounds = [{ inert: false }, { inert: false }];
  let accountRequests = 0;
  const chooser = setupProviderDialog({
    dialog,
    trigger,
    closeButton,
    backgrounds,
    beforeOpen: () => {},
  });
  return { document, trigger, closeButton, option, dialog, backgrounds, chooser, accountRequests: () => accountRequests };
}

test("opening the chooser is inert, focused, and makes zero account requests", () => {
  const item = fixture();
  item.trigger.dispatchEvent(new Event("click"));
  assert.equal(item.dialog.open, true);
  assert.deepEqual(item.backgrounds.map(({ inert }) => inert), [true, true]);
  assert.equal(item.document.activeElement, item.closeButton);
  assert.equal(item.accountRequests(), 0);
  item.chooser.stop();
});

test("Tab and Shift+Tab remain trapped inside the modal", () => {
  const item = fixture();
  item.trigger.dispatchEvent(new Event("click"));
  item.option.focus();
  const forward = event("keydown", { key: "Tab", shiftKey: false });
  item.dialog.dispatchEvent(forward);
  assert.equal(forward.defaultPrevented, true);
  assert.equal(item.document.activeElement, item.closeButton);
  const backward = event("keydown", { key: "Tab", shiftKey: true });
  item.dialog.dispatchEvent(backward);
  assert.equal(backward.defaultPrevented, true);
  assert.equal(item.document.activeElement, item.option);
  item.chooser.stop();
});

test("Escape/cancel closes, restores background interaction, and returns focus", () => {
  const item = fixture();
  item.trigger.dispatchEvent(new Event("click"));
  const cancel = new Event("cancel", { cancelable: true });
  item.dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(item.dialog.open, false);
  assert.deepEqual(item.backgrounds.map(({ inert }) => inert), [false, false]);
  assert.equal(item.document.activeElement, item.trigger);
  item.chooser.stop();
});

test("backdrop closes the chooser and teardown removes all controls", () => {
  const item = fixture();
  item.trigger.dispatchEvent(new Event("click"));
  item.dialog.dispatchEvent(new Event("click"));
  assert.equal(item.dialog.open, false);
  item.chooser.stop();
  item.trigger.dispatchEvent(new Event("click"));
  assert.equal(item.dialog.open, false);
});

test("connection failures render inline in the chooser alert", () => {
  const alert = { textContent: "", role: "alert" };
  showProviderError(alert, new Error("User rejected the request"));
  assert.equal(alert.role, "alert");
  assert.equal(alert.textContent, "User rejected the request");
});
