import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

class FakeClassList {
  contains() {
    return false;
  }

  remove() {}

  toggle() {}
}

class FakeElement {
  constructor(tagName, attributes = {}, textContent = "") {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = textContent;
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.style = { position: "", removeProperty() {} };
    this.clicked = 0;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  matches(selector) {
    return selector.split(",").some((part) => matchesSimpleSelector(this, part.trim()));
  }

  closest(selector) {
    return this.matches(selector) ? this : null;
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }

  getBoundingClientRect() {
    return { x: 0, y: 0, width: 100, height: 40 };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child) {
    return this.appendChild(child);
  }

  insertAdjacentElement(_position, child) {
    return this.appendChild(child);
  }

  addEventListener() {}

  cloneNode() {
    return new FakeElement(this.tagName, Object.fromEntries(this.attributes), this.textContent);
  }

  contains() {
    return false;
  }

  click() {
    this.clicked += 1;
  }

  remove() {}

  scrollIntoView() {}
}

function matchesSimpleSelector(element, selector) {
  if (!selector || selector.startsWith("#") || selector.startsWith(".")) {
    return false;
  }

  const tag = selector.match(/^[a-z]+/i)?.[0];
  if (tag && element.tagName !== tag.toUpperCase()) {
    return false;
  }

  const attributes = Array.from(selector.matchAll(/\[([^\]=~]+)(?:~?=['"]?([^'"\]]+)['"]?)?\]/g));
  return attributes.every(([, name, expected]) => {
    if (!element.hasAttribute(name)) {
      return false;
    }
    if (expected === undefined) {
      return true;
    }
    return element.getAttribute(name).split(/\s+/).includes(expected);
  });
}

function buildMeetDom(chatLabel) {
  const participantLabel = new FakeElement("span", { id: "DPUxh-nav9Xe" }, "Participants");
  const people = new FakeElement("div", {
    role: "button",
    tabindex: "0",
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    "aria-labelledby": "DPUxh-nav9Xe"
  });
  const chat = new FakeElement("button", {
    role: "button",
    "aria-label": chatLabel,
    "aria-expanded": "false",
    "data-panel-id": "2"
  });
  const head = new FakeElement("head");
  const body = new FakeElement("body");
  const elements = [chat, people];
  const elementsById = new Map([["DPUxh-nav9Xe", participantLabel]]);

  head.appendChild = (element) => {
    const id = element.getAttribute("id");
    if (id) {
      elementsById.set(id, element);
    }
    return element;
  };

  const document = {
    body,
    head,
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => elementsById.get(id) || null,
    querySelectorAll: (selector) => elements.filter((element) => element.matches(selector))
  };

  return { chat, document, people };
}

function runCompanion(chatLabel) {
  const { chat, document, people } = buildMeetDom(chatLabel);
  const window = {
    clearInterval() {},
    clearTimeout() {},
    getComputedStyle: () => ({ display: "block", opacity: "1", position: "static", visibility: "visible" }),
    setInterval: () => 1,
    setTimeout: () => 1
  };
  const context = {
    console,
    document,
    Element: FakeElement,
    MutationObserver: class {
      disconnect() {}
      observe() {}
    },
    Node: { ELEMENT_NODE: 1 },
    performance: { now: () => 0 },
    window
  };

  vm.runInNewContext(readFileSync(new URL("../standup-companion.js", import.meta.url), "utf8"), context);

  return { chat, people };
}

test("opens Participants instead of French Meet chat", () => {
  const { chat, people } = runCompanion("Discuter avec tous les participants");

  assert.equal(chat.clicked, 0, "the Chat control must remain untouched");
  assert.equal(people.clicked, 1, "the Participants control must be opened");
});

test("prefers an exact Participants name over an incidental translated mention", () => {
  const { chat, people } = runCompanion("Converser avec tous les participants");

  assert.equal(chat.clicked, 0, "an unknown translation must not outrank the exact Participants name");
  assert.equal(people.clicked, 1, "the exact accessible name must win");
});
