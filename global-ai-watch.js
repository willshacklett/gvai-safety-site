"use strict";

(() => {
  const watch = document.getElementById("global-ai-watch");
  // Poll the same-origin endpoint only on loopback or a Codespaces preview.
  const local = location.protocol === "http:" && ["127.0.0.1", "localhost"].includes(location.hostname);
  const forwarded = location.protocol === "https:" && /^[a-z0-9-]+-[0-9]+\.app\.github\.dev$/.test(location.hostname);
  if (!watch || !(local || forwarded)) return;

  const refreshControl = watch.querySelector("[data-watch-refresh]");
  const eventPanel = watch.querySelector("[data-watch-events]");
  const ticker = watch.querySelector("[data-watch-ticker]");
  const names = { openai: "OpenAI", claude: "Claude" };
  const labels = {
    operational: "Operational", degraded: "Degraded", partial_outage: "Partial outage",
    major_outage: "Major outage", maintenance: "Maintenance",
  };
  const refreshMs = 90_000;
  const maxAge = 15 * 60_000;
  const readings = new Map();
  let eventSignature;
  const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const dateText = (value) => formatDate.format(new Date(value));
  const hasDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

  function usable(data) {
    return data && Object.hasOwn(labels, data.status) && hasDate(data.verifiedAt)
      && hasDate(data.sourceUpdatedAt)
      && Number.isSafeInteger(data.active) && data.active >= 0
      && Number.isSafeInteger(data.affected) && data.affected >= 0
      && Array.isArray(data.components) && data.components.every(name => typeof name === "string")
      && Array.isArray(data.events) && data.events.every(event => event
        && typeof event.id === "string" && typeof event.name === "string"
        && typeof event.phase === "string" && hasDate(event.updatedAt));
  }

  function changeSummary(previous, current) {
    const changes = [];
    if (current.status !== previous.status) {
      changes.push(labels[previous.status] + " → " + labels[current.status]);
    }
    for (const [key, label] of [["active", "active incidents"], ["affected", "affected services"]]) {
      const delta = current[key] - previous[key];
      if (delta) changes.push((delta > 0 ? "+" : "") + delta + " " + label);
    }
    if (!changes.length && JSON.stringify(previous.components) !== JSON.stringify(current.components)) {
      changes.push("affected service list changed");
    }
    return changes.length ? "Since previous reading: " + changes.join(" · ") : "No change in status or counts.";
  }

  function draw(card, data, stale, change) {
    const set = (name, text) => {
      const node = card.querySelector("[data-" + name + "]");
      node.textContent = text;
      node.hidden = !text;
    };
    const status = card.querySelector("[data-status]");
    status.textContent = data ? (stale ? "Last known: " : "") + labels[data.status] : "Data unavailable";
    status.dataset.tone = data ? (stale ? "stale" : data.status) : "unavailable";
    set("note", stale ? "Stale data. Latest refresh could not be verified."
      : data ? "" : "No verified reading is available. Visit the official source.");
    card.querySelector("[data-metrics]").hidden = !data;
    set("active", data ? String(data.active) : "");
    set("affected", data ? String(data.affected) : "");
    set("components", data?.components.length ? data.components.join(", ")
      + (data.affected > data.components.length ? " and " + (data.affected - data.components.length) + " more" : "") : "");
    const latest = data?.events[0];
    set("latest", latest ? "Latest incident update: " + latest.name + " · " + dateText(latest.updatedAt)
      : data ? "Source updated " + dateText(data.sourceUpdatedAt) : "");
    set("verified", data ? "Last verified " + dateText(data.verifiedAt) : "");
    set("change", stale ? "" : change);
  }

  function officialXaiLink(value) {
    try {
      const url = new URL(value);
      return url.origin === "https://status.x.ai" && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  function drawXai(entry) {
    const card = watch.querySelector('[data-provider="xai"]');
    const data = entry?.data;
    const supplied = ["fresh", "stale"].includes(entry?.state) && data && hasDate(data.verifiedAt)
      && Array.isArray(data.events) && data.events.every(event => event && typeof event.name === "string"
        && typeof event.description === "string" && hasDate(event.publishedAt) && officialXaiLink(event.link)
        && [null, "investigating", "identified", "monitoring", "resolved"].includes(event.phase));
    if (supplied) readings.set("xai", data);
    const previous = readings.get("xai");
    const current = previous && Date.now() - Date.parse(previous.verifiedAt) < maxAge ? previous : null;
    const stale = Boolean(current && (!supplied || entry.state !== "fresh"));
    const latest = current?.events[0];
    const set = (name, text) => {
      const node = card.querySelector("[data-" + name + "]");
      node.textContent = text;
      node.hidden = !text;
      return node;
    };
    const badge = set("status", current ? (stale ? "Stale incident feed" : "Incident feed verified") : "Data unavailable");
    badge.dataset.tone = stale ? "stale" : "unavailable";
    set("note", !current ? "The official incident feed could not be verified. Visit the official source."
      : (stale ? "Latest refresh failed. " : "") + "Current component health is unavailable."
      + (latest ? "" : " The retrieved feed contains no incident entries."));
    const update = card.querySelector("[data-latest]");
    const updateKey = latest ? JSON.stringify(latest) : "";
    if (update.dataset.key !== updateKey) {
      update.dataset.key = updateKey;
      update.hidden = !latest;
      update.textContent = latest ? "Latest published incident · " + dateText(latest.publishedAt)
        + (latest.phase ? " · " + latest.phase : "") + " · " : "";
      if (latest) {
        const link = document.createElement("a");
        link.href = latest.link;
        link.textContent = latest.name;
        link.className = "ai-watch-source";
        update.append(link);
      }
    }
    set("xai-description", latest?.description || "");
    set("verified", current ? "Last verified " + dateText(current.verifiedAt) : "");
    return {
      verifiedAt: current ? Date.parse(current.verifiedAt) : 0,
      events: current?.events.map(event => ({
        id: event.link, name: "xAI / Grok · " + event.name, updatedAt: event.publishedAt,
        phase: event.phase || "phase not reported", stale,
      })) || [],
    };
  }

  function apply(payload) {
    const events = [];
    let latestCheck = 0;
    for (const [provider, name] of Object.entries(names)) {
      const card = watch.querySelector('[data-provider="' + provider + '"]');
      const entry = payload?.providers[provider];
      let previous = readings.get(provider);
      const supplied = ["fresh", "stale"].includes(entry?.state) && usable(entry.data);
      if (supplied && entry.state === "fresh" && previous?.data.verifiedAt !== entry.data.verifiedAt) {
        previous = {
          data: entry.data,
          change: previous ? changeSummary(previous.data, entry.data) : "First verified reading.",
        };
        readings.set(provider, previous);
      }
      let data = supplied ? entry.data : previous?.data;
      if (data && Date.now() - Date.parse(data.verifiedAt) >= maxAge) data = null;
      const stale = Boolean(data && (!supplied || entry.state !== "fresh"));
      draw(card, data, stale, previous?.change || "");
      if (data) {
        latestCheck = Math.max(latestCheck, Date.parse(data.verifiedAt));
        events.push(...data.events.map(event => ({ ...event, name: name + " · " + event.name, stale })));
      }
    }
    const xai = drawXai(payload?.providers.xai);
    latestCheck = Math.max(latestCheck, xai.verifiedAt);
    events.push(...xai.events);
    events.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const recent = events.slice(0, 5);
    const signature = JSON.stringify(recent);
    if (signature !== eventSignature) {
      ticker.replaceChildren(...recent.map(event => {
        const row = document.createElement("li");
        if (eventSignature && !event.stale) row.className = "ai-watch-new";
        const title = document.createElement("strong");
        const time = document.createElement("time");
        title.textContent = event.name;
        time.dateTime = event.updatedAt;
        time.textContent = dateText(event.updatedAt) + " · " + event.phase.replaceAll("_", " ")
          + (event.stale ? " · Last known" : "");
        row.append(title, time);
        return row;
      }));
      eventPanel.hidden = !recent.length;
      eventSignature = signature;
    }
    const next = new Date(Date.now() + refreshMs);
    refreshControl.textContent = (latestCheck ? "Last verified " + dateText(latestCheck) : "Waiting for a verified reading")
      + " · Next refresh " + dateText(next);
  }

  async function refresh() {
    let payload;
    try {
      const response = await fetch("/__local/gvai-watch.json", {
        cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const value = await response.json();
        if (value?.version === 1 && value.providers && typeof value.providers === "object") payload = value;
      }
    } catch {
      // A failed check leaves only explicitly labeled last-known readings.
    }
    apply(payload);
    window.setTimeout(refresh, refreshMs);
  }

  refreshControl.textContent = "Checking official sources…";
  refresh();
})();
