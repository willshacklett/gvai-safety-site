"""Loopback-only preview for the Global AI Watch public status feed."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.client import HTTPException
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from threading import Lock
from time import monotonic
from urllib.parse import unquote
from urllib.request import HTTPRedirectHandler, Request, build_opener

import xai_feed

ROOT = Path(__file__).resolve().parents[2]
PROVIDERS = {
    "openai": ("https://status.openai.com", "01JMDK9XYNY6RXSED6SDWW50WY"),
    "claude": ("https://status.claude.com", "tymt9n04zgry"),
}
RESOURCES = {"summary": "/api/v2/summary.json", "history": "/api/v2/incidents.json"}
REFRESH_SECONDS = 90
STALE_SECONDS = 15 * 60
TIMEOUT_SECONDS = 5
MAX_BYTES = 1024 * 1024
STATUS = {
    "none": "operational", "minor": "degraded", "major": "partial_outage",
    "critical": "major_outage", "maintenance": "maintenance",
}
COMPONENT_STATUS = {
    "operational", "degraded_performance", "partial_outage", "major_outage", "under_maintenance",
}
ACTIVE = {"investigating", "identified", "monitoring", "in_progress", "verifying"}
CLOSED = {"resolved", "postmortem", "scheduled", "completed"}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch(provider, resource):
    base, _ = PROVIDERS[provider]
    request = Request(base + RESOURCES[resource], headers={"Accept": "application/json"})
    deadline = monotonic() + TIMEOUT_SECONDS
    with build_opener(NoRedirect).open(request, timeout=TIMEOUT_SECONDS) as response:
        if response.headers.get_content_type() != "application/json":
            raise ValueError("Expected JSON")
        data = bytearray()
        while len(data) <= MAX_BYTES:
            if monotonic() >= deadline:
                raise TimeoutError("Provider read timed out")
            chunk = response.read1(min(65536, MAX_BYTES + 1 - len(data)))
            if not chunk:
                return json.loads(data)
            data.extend(chunk)
        raise ValueError("Provider response exceeded size limit")


def timestamp(value):
    date = datetime.fromisoformat(value)
    if date.tzinfo is None:
        raise ValueError("Timestamp has no timezone")
    return date.astimezone(timezone.utc).isoformat()


def records(value):
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError("Expected a list of objects")
    return value


def nonempty(value, limit=180):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Expected text")
    return value.strip()[:limit]


def reconcile(provider, summary, history):
    expected_id = PROVIDERS[provider][1]
    if any(payload["page"]["id"] != expected_id for payload in (summary, history)):
        raise ValueError("Unexpected status page identifier")

    status = STATUS[summary["status"]["indicator"]]
    components = records(summary["components"])
    if not components:
        raise ValueError("Missing components")
    affected = {}
    for component in components:
        state = component["status"]
        if state not in COMPONENT_STATUS:
            raise ValueError("Unknown component status")
        if component.get("group") is not True and state != "operational":
            affected[nonempty(component["id"])] = nonempty(component["name"])

    # The newest official entry wins if summary and history reflect different update times.
    incidents = {}
    for raw in records(history["incidents"]) + records(summary.get("incidents", [])):
        phase = raw["status"]
        if phase not in ACTIVE | CLOSED:
            raise ValueError("Unknown incident phase")
        incident_id = nonempty(raw["id"])
        changed = timestamp(raw["updated_at"])
        if incident_id in incidents and changed < incidents[incident_id][0]:
            continue
        updates = records(raw.get("incident_updates", []))
        latest = max(updates, key=lambda update: timestamp(update["created_at"]), default=None)
        event = {
            "id": incident_id, "name": nonempty(raw["name"]), "phase": phase,
            "updatedAt": timestamp(latest["created_at"]) if latest else changed,
        }
        incidents[incident_id] = (changed, event)
    events = sorted((item[1] for item in incidents.values()), key=lambda event: event["updatedAt"], reverse=True)
    return {
        "status": status,
        "active": sum(event["phase"] in ACTIVE for event in events),
        "affected": len(affected),
        "components": sorted(affected.values())[:12],
        "events": events[:4],
        "sourceUpdatedAt": timestamp(summary["page"]["updated_at"]),
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    }


def fetch_xai():
    return xai_feed.fetch(build_opener(NoRedirect), TIMEOUT_SECONDS, MAX_BYTES)


class StatusCache:
    """Refresh official reads at most once per polling interval, across all tabs."""

    def __init__(self, read=fetch, clock=monotonic, read_xai=fetch_xai):
        self.read = read
        self.read_xai = read_xai
        self.clock = clock
        self.lock = Lock()
        self.cache = {}
        self.next_refresh = 0

    def snapshot(self):
        with self.lock:
            now = self.clock()
            if now < self.next_refresh:
                return self.cache.copy()
            self.next_refresh = now + REFRESH_SECONDS
            with ThreadPoolExecutor(max_workers=5) as pool:
                reads = {
                    provider: [pool.submit(self.read, provider, resource) for resource in RESOURCES]
                    for provider in PROVIDERS
                }
                reads["xai"] = [pool.submit(self.read_xai)]
                for provider, sources in reads.items():
                    try:
                        result = (
                            sources[0].result() if provider == "xai"
                            else reconcile(provider, *(source.result() for source in sources))
                        )
                        self.cache[provider] = {"state": "fresh", "data": result, "checked": now}
                    except (OSError, ValueError, KeyError, TypeError, AttributeError, HTTPException):
                        previous = self.cache.get(provider)
                        if previous and previous["data"] and now - previous["checked"] < STALE_SECONDS:
                            self.cache[provider] = {**previous, "state": "stale"}
                        else:
                            self.cache[provider] = {"state": "unavailable", "data": None, "checked": now}
            return self.cache.copy()

    def response(self):
        return {
            "version": 1,
            "providers": {
                provider: {"state": entry["state"], "data": entry["data"]}
                for provider, entry in self.snapshot().items()
            },
        }


class PreviewHandler(SimpleHTTPRequestHandler):
    cache = StatusCache()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def parse_request(self):
        if not super().parse_request():
            return False
        port = self.server.server_port
        allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
        codespace = os.environ.get("CODESPACE_NAME")
        domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
        if codespace and domain:
            forwarded = f"{codespace}-{port}.{domain}".lower()
            allowed.update({forwarded, f"{forwarded}:443"})
        hosts = self.headers.get_all("Host", [])
        if len(hosts) != 1 or hosts[0].lower() not in allowed:
            self.send_error(403)
            return False
        return True

    def do_GET(self):
        if self.path != "/__local/gvai-watch.json":
            super().do_GET()
            return
        body = json.dumps(self.cache.response(), ensure_ascii=True).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_head(self):
        if self.path == "/favicon.ico":
            self.path = "/assets/gvai-mark.svg"
        path = Path(unquote(self.path.split("?", 1)[0]).lstrip("/") or "index.html")
        allowed = (
            len(path.parts) == 1 and path.suffix in {".html", ".css", ".js"}
            or len(path.parts) == 2 and path.parts[0] == "assets"
        )
        target = ROOT / path
        if not allowed or not target.is_file() or not target.resolve().is_relative_to(ROOT):
            self.send_error(404)
            return None
        return super().send_head()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8002)
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler) as server:
        print(f"Global AI Watch preview: http://127.0.0.1:{server.server_port}/#global-ai-watch", flush=True)
        server.serve_forever()
