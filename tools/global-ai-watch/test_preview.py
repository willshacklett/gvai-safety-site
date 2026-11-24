import io
import json
import unittest
from copy import deepcopy
from email.message import Message
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.error import HTTPError

import preview

DATE = "2026-11-20T10:00:00Z"


def sample(provider):
    page = {"id": preview.PROVIDERS[provider][1], "updated_at": DATE}
    return {
        "summary": {
            "page": page,
            "status": {"indicator": "none"},
            "components": [{"id": "app", "name": "Example app", "status": "operational"}],
        },
        "history": {"page": page, "incidents": []},
    }


class StatusTests(unittest.TestCase):
    def test_valid_reading(self):
        for provider in preview.PROVIDERS:
            result = preview.reconcile(provider, **sample(provider))
            self.assertEqual((result["status"], result["active"], result["affected"]), ("operational", 0, 0))

    def test_active_resolved_outage_and_affected(self):
        data = sample("claude")
        summary, history = data["summary"], data["history"]
        summary["status"]["indicator"] = "critical"
        summary["components"][0]["status"] = "major_outage"
        summary["components"].append({"id": "group", "name": "Group", "status": "major_outage", "group": True})
        active = {"id": "case1", "name": "Example incident", "status": "investigating", "updated_at": DATE}
        summary["incidents"] = [active]
        history["incidents"] = [active, {**active, "id": "case2", "status": "resolved"},
                                {**active, "id": "case3", "status": "scheduled"}]
        result = preview.reconcile("claude", **data)
        self.assertEqual((result["status"], result["active"], result["affected"]), ("major_outage", 1, 1))
        self.assertEqual(result["components"], ["Example app"])
        self.assertEqual(len(result["events"]), 3)
        history["incidents"][0] = {**active, "status": "resolved", "updated_at": "2026-11-20T11:00:00Z"}
        self.assertEqual(preview.reconcile("claude", **data)["active"], 0)

    def test_bad_schema_or_wrong_page(self):
        for key, value in (("components", {}), ("page", {"id": "wrong"}), ("status", {"indicator": "other"})):
            data = sample("openai")
            data["summary"][key] = value
            with self.assertRaises((KeyError, ValueError)):
                preview.reconcile("openai", **data)

    def test_invalid_json_and_response_size(self):
        for body, error in ((b"not JSON", json.JSONDecodeError), (b"x" * (preview.MAX_BYTES + 1), ValueError)):
            response = io.BytesIO(body)
            response.headers = Message()
            response.headers["Content-Type"] = "application/json"
            with patch("preview.build_opener") as opener:
                opener.return_value.open.return_value = response
                with self.assertRaises(error):
                    preview.fetch("openai", "summary")
                request = opener.return_value.open.call_args.args[0]
                self.assertEqual(request.full_url, "https://status.openai.com/api/v2/summary.json")
                self.assertEqual(opener.return_value.open.call_args.kwargs["timeout"], preview.TIMEOUT_SECONDS)

    def test_cache_rate_limit_timeout_stale_expiry_and_recovery(self):
        now = 0
        calls = []
        failure = None

        def read(provider, resource):
            calls.append((provider, resource))
            if provider == "openai" and failure:
                raise failure
            return deepcopy(sample(provider)[resource])

        cache = preview.StatusCache(read, lambda: now, read_xai=lambda: {})
        self.assertEqual(cache.response()["providers"]["openai"]["state"], "fresh")
        now = 89
        cache.response()
        self.assertEqual(len(calls), 4)
        failure = TimeoutError()
        now = 90
        response = cache.response()["providers"]
        self.assertEqual(response["openai"]["state"], "stale")
        self.assertEqual(response["claude"]["state"], "fresh")
        now = 900
        self.assertEqual(cache.response()["providers"]["openai"], {"state": "unavailable", "data": None})
        failure = None
        now = 990
        self.assertEqual(cache.response()["providers"]["openai"]["state"], "fresh")

    def test_source_unavailable_on_first_read(self):
        def unavailable(*_):
            raise HTTPError("https://status.openai.com/", 503, "", None, None)

        self.assertTrue(all(item["data"] is None for item in preview.StatusCache(unavailable, read_xai=unavailable).response()["providers"].values()))


class HandlerTests(unittest.TestCase):
    def request(self, path, *hosts, method="GET"):
        headers = "".join(f"Host: {host}\r\n" for host in hosts)
        wire = f"{method} {path} HTTP/1.1\r\n{headers}Connection: close\r\n\r\n"
        request = Mock()
        request.makefile.return_value = io.BytesIO(wire.encode())
        with patch.dict("os.environ", {
            "CODESPACE_NAME": "example-space",
            "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN": "app.github.dev",
        }), patch.object(preview.PreviewHandler, "log_message"):
            preview.PreviewHandler(request, ("127.0.0.1", 12345), SimpleNamespace(server_port=8004))
        return b"".join(call.args[0] for call in request.sendall.call_args_list)

    def test_static_paths_on_loopback_and_forwarded_host(self):
        for host in ("127.0.0.1:8004", "localhost:8004", "example-space-8004.app.github.dev"):
            for path, mime, content in (
                ("/", b"text/html", b"global-ai-watch"),
                ("/index.html", b"text/html", b"global-ai-watch"),
                ("/favicon.ico", b"image/svg+xml", b"<svg"),
                ("/global-ai-watch.js", b"javascript", b"/__local/gvai-watch.json"),
            ):
                with self.subTest(host=host, path=path):
                    response = self.request(path, host)
                    self.assertIn(b" 200 OK", response.splitlines()[0])
                    headers, body = response.split(b"\r\n\r\n", 1)
                    self.assertIn(mime, headers)
                    self.assertIn(content, body)

    def test_forwarded_endpoint_and_rejected_hosts(self):
        result = {"version": 1, "providers": {}}
        with patch.object(preview.PreviewHandler.cache, "response", return_value=result) as read:
            response = self.request("/__local/gvai-watch.json", "example-space-8004.app.github.dev:443")
            self.assertIn(b" 200 OK", response.splitlines()[0])
            self.assertEqual(json.loads(response.split(b"\r\n\r\n", 1)[1]), result)
            self.assertIn(b"Cache-Control: no-store", response)
            for hosts in ((), ("attacker.invalid",), ("example-space-8005.app.github.dev",),
                          ("other-space-8004.app.github.dev",), ("example-space-8004.app.github.dev.attacker.invalid",),
                          ("127.0.0.1:8004", "attacker.invalid")):
                self.assertIn(b" 403 ", self.request("/__local/gvai-watch.json", *hosts).splitlines()[0])
            read.assert_called_once()
        self.assertIn(b" 403 ", self.request("/", "attacker.invalid", method="HEAD").splitlines()[0])

    def test_traversal_and_missing_files(self):
        for path in ("/missing.html", "/../index.html", "/%2e%2e/index.html",
                     "/assets/%2e%2e/index.html", "/%2e%2e%2findex.html", "/.git"):
            with self.subTest(path=path):
                self.assertIn(b" 404 ", self.request(path, "example-space-8004.app.github.dev").splitlines()[0])


if __name__ == "__main__":
    unittest.main()
