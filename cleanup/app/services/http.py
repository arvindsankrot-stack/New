"""Polite outbound HTTP: identifies itself, respects robots.txt for page fetches,
limits size, never logs in or solves CAPTCHAs."""
from __future__ import annotations

import time
import urllib.robotparser
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlsplit

import httpx

from ..config import get_settings

MAX_BYTES = 10 * 1024 * 1024
_robots_cache: dict[str, tuple[float, urllib.robotparser.RobotFileParser | None]] = {}
_ROBOTS_TTL = 24 * 3600

# Tests can swap this out for an httpx.MockTransport.
transport: Optional[httpx.BaseTransport] = None


def client(**kwargs) -> httpx.Client:
    headers = {"User-Agent": get_settings().http_user_agent}
    headers.update(kwargs.pop("headers", {}))
    return httpx.Client(headers=headers, timeout=kwargs.pop("timeout", 20.0),
                        follow_redirects=kwargs.pop("follow_redirects", True), transport=transport, **kwargs)


def robots_allowed(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return False
    origin = f"{parts.scheme}://{parts.netloc}"
    cached = _robots_cache.get(origin)
    if cached is None or time.time() - cached[0] > _ROBOTS_TTL:
        rp: urllib.robotparser.RobotFileParser | None = urllib.robotparser.RobotFileParser()
        try:
            with client(timeout=10.0) as c:
                r = c.get(origin + "/robots.txt")
            if r.status_code in (401, 403):
                rp = None  # access restricted: treat as disallow-all
            elif r.status_code >= 400:
                rp.parse([])  # no robots.txt: everything allowed
            else:
                rp.parse(r.text.splitlines())
        except httpx.HTTPError:
            rp.parse([])
        cached = (time.time(), rp)
        _robots_cache[origin] = cached
    rp = cached[1]
    if rp is None:
        return False
    return rp.can_fetch(get_settings().http_user_agent, url)


@dataclass
class FetchResult:
    status: int  # HTTP status, or 0 on network error, -1 if robots.txt disallows
    content_type: str = ""
    text: str = ""
    content: bytes = b""
    error: str = ""


def polite_get(url: str, want_bytes: bool = False) -> FetchResult:
    if not robots_allowed(url):
        return FetchResult(status=-1, error="robots.txt disallows fetching this URL")
    try:
        with client() as c, c.stream("GET", url) as r:
            ctype = r.headers.get("content-type", "")
            data = b""
            for chunk in r.iter_bytes():
                data += chunk
                if len(data) > MAX_BYTES:
                    break
            text = "" if want_bytes else data.decode(r.encoding or "utf-8", errors="replace")
            return FetchResult(status=r.status_code, content_type=ctype, text=text, content=data if want_bytes else b"")
    except httpx.HTTPError as e:
        return FetchResult(status=0, error=str(e))


def domain_of(url: str) -> str:
    import tldextract

    ext = tldextract.TLDExtract(suffix_list_urls=())(url)
    return ".".join(p for p in (ext.domain, ext.suffix) if p).lower()
