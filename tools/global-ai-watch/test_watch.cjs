const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../../global-ai-watch.js"), "utf8");

function node() {
  return {
    hidden: false, textContent: "", dataset: {}, children: [],
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
  };
}

function view() {
  const fields = new Map();
  return {
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, node());
      return fields.get(selector);
    },
  };
}

async function test() {
  let time = Date.parse("2026-11-20T10:00:00Z");
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }

  const watch = view();
  const cards = { openai: view(), claude: view(), xai: view() };
  const originalQuery = watch.querySelector;
  watch.querySelector = selector => cards[selector.split('"')[1]] || originalQuery(selector);
  let next;
  let payload;
  let requests = 0;
  const context = {
    document: { getElementById: () => watch, createElement: node },
    window: { setTimeout(fn, ms) { assert.equal(ms, 90_000); next = fn; } },
    Date: FakeDate,
    AbortSignal,
    URL,
    location: { protocol: "http:", hostname: "127.0.0.1" },
    async fetch(route) {
      requests++;
      assert.equal(route, "/__local/gvai-watch.json");
      if (!payload) throw new Error("timeout");
      return {
        ok: true, headers: { get: () => "application/json" },
        json: async () => payload,
      };
    },
  };
  const data = (status, active, affected, events = []) => ({
    status, active, affected, events,
    components: affected ? ["Example app"] : [],
    sourceUpdatedAt: new FakeDate().toISOString(),
    verifiedAt: new FakeDate().toISOString(),
  });
  const feed = value => ({ version: 1, providers: { openai: { state: "fresh", data: value } } });
  const status = () => cards.openai.querySelector("[data-status]").textContent;
  const active = () => cards.openai.querySelector("[data-active]").textContent;

  vm.runInNewContext(script, { ...context, location: { protocol: "https:", hostname: "example.com" } });
  vm.runInNewContext(script, { ...context, location: { protocol: "https:", hostname: "example-8004.app.github.dev.invalid" } });
  assert.equal(requests, 0);

  payload = feed(data("operational", 0, 0));
  vm.runInNewContext(script, { ...context, location: { protocol: "https:", hostname: "example-8004.app.github.dev" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status(), "Operational");
  assert.equal(active(), "0");
  assert.equal(cards.claude.querySelector("[data-status]").textContent, "Data unavailable");

  time += 90_000;
  const event = { id: "demo", name: "<em>Example incident</em>", phase: "investigating", updatedAt: new FakeDate().toISOString() };
  payload = feed(data("major_outage", 1, 1, [event]));
  await next();
  assert.equal(status(), "Major outage");
  assert.equal(active(), "1");
  assert.match(cards.openai.querySelector("[data-change]").textContent, /\+1 active incidents/);
  const ticker = watch.querySelector("[data-watch-ticker]");
  assert.equal(ticker.children[0].children[0].textContent, "OpenAI · <em>Example incident</em>");

  time += 90_000;
  payload = undefined;
  await next();
  assert.equal(status(), "Last known: Major outage");
  assert.equal(active(), "1");
  assert.match(cards.openai.querySelector("[data-note]").textContent, /Stale data/);

  time += 15 * 60_000;
  payload = { version: 2, providers: {} };
  await next();
  assert.equal(status(), "Data unavailable");
  assert.equal(cards.openai.querySelector("[data-metrics]").hidden, true);

  time += 90_000;
  payload = feed(data("operational", 0, 0, [{ ...event, phase: "resolved" }]));
  await next();
  assert.equal(status(), "Operational");
  assert.equal(active(), "0");
  assert.match(ticker.children[0].children[1].textContent, /resolved/);

  const xaiStatus = () => cards.xai.querySelector("[data-status]").textContent;
  const xaiNote = () => cards.xai.querySelector("[data-note]").textContent;
  assert.equal(xaiStatus(), "Data unavailable");

  time += 90_000;
  payload.providers.xai = { state: "fresh", data: { events: [], verifiedAt: new FakeDate().toISOString() } };
  await next();
  assert.equal(xaiStatus(), "Incident feed verified");
  assert.match(xaiNote(), /component health is unavailable/);
  assert.match(xaiNote(), /no incident entries/);

  time += 90_000;
  const xaiEvent = {
    name: "Example Grok incident", publishedAt: new FakeDate().toISOString(),
    phase: null, description: "Example description", link: "https://status.x.ai/incident/example",
  };
  payload.providers.xai.data = { events: [xaiEvent], verifiedAt: new FakeDate().toISOString() };
  await next();
  const latest = cards.xai.querySelector("[data-latest]");
  assert.equal(latest.children.at(-1).href, xaiEvent.link);
  assert.equal(latest.children.at(-1).textContent, xaiEvent.name);
  assert.match(ticker.children[0].children[1].textContent, /phase not reported/);

  payload.providers.xai.state = "stale";
  await next();
  assert.equal(xaiStatus(), "Stale incident feed");
  time += 15 * 60_000;
  payload.providers.xai = { state: "fresh", data: { events: [{ ...xaiEvent, link: "https://example.invalid/" }], verifiedAt: new FakeDate().toISOString() } };
  await next();
  assert.equal(xaiStatus(), "Data unavailable");
}

test().then(() => console.log("Watch view fixture passed for refresh, active incident, outage, stale, expiry, and recovery."));
