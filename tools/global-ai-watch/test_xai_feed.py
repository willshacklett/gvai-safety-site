"""Synthetic RSS 2.0 fixtures for the documented xAI feed transport."""

import io
import unittest
from email.message import Message
from unittest.mock import Mock, patch
from urllib.error import HTTPError

import preview
import xai_feed
from test_preview import sample

PREFIX = b'<rss version="2.0"><channel><title>xAI Status</title><link>https://status.x.ai/</link>'
SUFFIX = b'</channel></rss>'
ITEM = b'''<item><title>Example incident</title><link>/incident/example</link>
    <pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[<p>Example report &amp; update.</p>]]></description>%s</item>'''


def rss(*items):
    return PREFIX + b"".join(items) + SUFFIX


def response(body, status=200, content_type="application/rss+xml"):
    result = io.BytesIO(body)
    result.status = status
    result.headers = Message()
    result.headers["Content-Type"] = content_type
    return result


class XaiTests(unittest.TestCase):
    def test_valid_active_resolved_and_unknown_phase(self):
        data = xai_feed.parse(rss(
            ITEM % b"<status>investigating</status>",
            ITEM % b"<status>resolved</status>",
            ITEM % b"",
        ))
        self.assertEqual(data["incidentCount"], 3)
        self.assertNotIn("status", data)
        self.assertNotIn("active", data)
        self.assertEqual([event["phase"] for event in data["events"]], ["investigating", "resolved", None])
        event = data["events"][0]
        self.assertEqual(event["link"], "https://status.x.ai/incident/example")
        self.assertEqual(event["publishedAt"], "2026-11-20T10:00:00+00:00")
        self.assertEqual(event["description"], "Example report & update.")

    def test_empty_feed(self):
        data = xai_feed.parse(rss())
        self.assertEqual(data["events"], [])
        self.assertEqual(data["incidentCount"], 0)
        self.assertNotIn("status", data)

    def test_malformed_unsafe_or_incomplete_feed(self):
        unsafe = '<!DOCTYPE rss [<!ENTITY remote SYSTEM "https://invalid.example/entity">]>'
        cases = (
            b"<rss>",
            (unsafe + rss().decode()).encode("utf-16"),
            rss((ITEM % b"").replace(b"<pubDate>", b"<date>").replace(b"</pubDate>", b"</date>")),
            rss((ITEM % b"").replace(b"/incident/example", b"https://status.x.ai.invalid/incident")),
        )
        for body in cases:
            with self.subTest(body=body), self.assertRaises(ValueError):
                xai_feed.parse(body)

    def test_http_status_content_type_size_and_timeout(self):
        opener = Mock()
        for body in (response(rss(), 204), response(rss(), content_type="text/html"),
                     response(rss() + b"x" * 512)):
            opener.open.return_value = body
            with self.assertRaises(ValueError):
                xai_feed.fetch(opener, 5, 512)
        opener.open.return_value = response(rss())
        self.assertEqual(xai_feed.fetch(opener, 5, 512)["incidentCount"], 0)
        self.assertEqual(opener.open.call_args.args[0].full_url, xai_feed.FEED_URL)
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 5)
        opener.open.side_effect = TimeoutError()
        with self.assertRaises(TimeoutError):
            xai_feed.fetch(opener, 5, 512)

    def test_redirect_rejected(self):
        with patch("preview.build_opener") as build:
            mock_opener = build.return_value
            mock_opener.open.side_effect = HTTPError(xai_feed.FEED_URL, 302, "redirect", None, None)
            with self.assertRaises(HTTPError):
                preview.fetch_xai()
            build.assert_called_once_with(preview.NoRedirect)
            self.assertEqual(mock_opener.open.call_count, 1)
        self.assertIsNone(preview.NoRedirect().redirect_request(
            None, None, 302, "redirect", {}, "https://invalid.example/feed.xml"
        ))

    def test_unavailable_stale_expiry_and_recovery(self):
        now = 0
        available = False

        def read_xai():
            if not available:
                raise OSError("RSS unavailable")
            return xai_feed.parse(rss(ITEM % b""))

        def read_json(provider, resource):
            return sample(provider)[resource]

        cache = preview.StatusCache(read_json, lambda: now, read_xai)
        self.assertEqual(cache.response()["providers"]["xai"]["state"], "unavailable")
        available = True
        now = 90
        fresh = cache.response()["providers"]["xai"]
        self.assertEqual(fresh["state"], "fresh")
        available = False
        now = 180
        stale = cache.response()["providers"]["xai"]
        self.assertEqual(stale, {**fresh, "state": "stale"})
        now = 990
        self.assertEqual(cache.response()["providers"]["xai"], {"state": "unavailable", "data": None})
        available = True
        now = 1080
        self.assertEqual(cache.response()["providers"]["xai"]["state"], "fresh")
