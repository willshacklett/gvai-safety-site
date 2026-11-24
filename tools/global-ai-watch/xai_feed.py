"""Read incident history from xAI's documented public RSS feed."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from time import monotonic
from urllib.parse import urljoin, urlsplit
from urllib.request import Request
from xml.etree import ElementTree

FEED_URL = "https://status.x.ai/feed.xml"
XML_TYPES = {"application/rss+xml", "application/xml", "text/xml"}


class NoDoctype(ElementTree.TreeBuilder):
    def doctype(self, *args):
        raise ValueError("RSS DTDs and entity declarations are forbidden")


class DescriptionText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def description_text(value):
    parser = DescriptionText()
    parser.feed(value)
    parser.close()
    return " ".join(" ".join(parser.parts).split())[:320]


def official_link(value):
    if not value or any(character.isspace() or ord(character) < 32 for character in value):
        raise ValueError("Invalid RSS link")
    url = urlsplit(urljoin(FEED_URL, value))
    if url.scheme != "https" or url.netloc.lower() != "status.x.ai" or "\\" in value:
        raise ValueError("Unapproved RSS link")
    return url.geturl()


def required_text(element, field):
    value = element.findtext(field, "").strip()
    if not value:
        raise ValueError(f"Missing RSS field: {field}")
    return value


def parse(body):
    try:
        root = ElementTree.fromstring(body, parser=ElementTree.XMLParser(target=NoDoctype()))
    except ElementTree.ParseError as error:
        raise ValueError("Malformed RSS XML") from error

    channels = root.findall("channel")
    if root.tag != "rss" or root.get("version") != "2.0" or len(channels) != 1:
        raise ValueError("Expected one RSS 2.0 channel")
    channel = channels[0]
    required_text(channel, "title")
    official_link(required_text(channel, "link"))

    events = []
    for item in channel.findall("item"):
        try:
            published = parsedate_to_datetime(required_text(item, "pubDate"))
            if published.tzinfo is None:
                raise ValueError("Incident publication date has no timezone")
            published_at = published.astimezone(timezone.utc).isoformat()
        except OverflowError as error:
            raise ValueError("Incident publication date is out of range") from error
        phase = item.findtext("status", "").strip().lower()
        # Use an explicit, recognized phase only. RSS prose is not a status contract.
        if phase not in {"investigating", "identified", "monitoring", "resolved"}:
            phase = None
        events.append({
            "name": required_text(item, "title")[:180],
            "publishedAt": published_at,
            "link": official_link(required_text(item, "link")),
            "description": description_text(required_text(item, "description")),
            "phase": phase,
        })
    events.sort(key=lambda item: item["publishedAt"], reverse=True)
    return {
        "events": events[:4],
        "incidentCount": len(events),
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    }


def fetch(opener, timeout, max_bytes):
    request = Request(FEED_URL, headers={"Accept": ", ".join(sorted(XML_TYPES))})
    deadline = monotonic() + timeout
    with opener.open(request, timeout=timeout) as response:
        if response.status != 200 or response.headers.get_content_type() not in XML_TYPES:
            raise ValueError("Expected a successful RSS XML response")
        body = bytearray()
        while len(body) <= max_bytes:
            if monotonic() >= deadline:
                raise TimeoutError("RSS read timed out")
            chunk = response.read1(min(65536, max_bytes + 1 - len(body)))
            if not chunk:
                return parse(body)
            body.extend(chunk)
        raise ValueError("RSS exceeded response size limit")
