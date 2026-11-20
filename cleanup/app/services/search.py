"""Search job: web search APIs + Reddit official API, per seed and per discovered account."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Iterable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import Finding, Seed, SiteAccount, log_job
from . import http
from .http import domain_of


@dataclass
class Hit:
    url: str
    title: str = ""
    snippet: str = ""
    thumbnail_url: str = ""
    image_url: str = ""
    source: str = ""
    meta: dict = field(default_factory=dict)
    content_type_hint: str = ""


# ---------------------------------------------------------------------------
# Query building
# ---------------------------------------------------------------------------

SITE_SPECIFIC_USERNAME = ["reddit.com", "quora.com", "medium.com", "github.com", "pinterest.com", "tumblr.com"]


def queries_for_seed(seed: Seed) -> list[str]:
    v = seed.value.strip()
    if not v:
        return []
    if seed.kind == "username":
        qs = [f'"{v}"']
        qs += [f'site:{d} "{v}"' for d in SITE_SPECIFIC_USERNAME]
        return qs
    if seed.kind == "email":
        return [f'"{v}"']
    if seed.kind == "phone":
        digits = "".join(c for c in v if c.isdigit())
        variants = {v, digits}
        if len(digits) >= 10:
            local = digits[-10:]
            variants |= {local, f"{local[:5]} {local[5:]}", f"+91 {local}", f"+91{local}"}
        return [f'"{x}"' for x in sorted(variants) if x]
    if seed.kind == "name":
        return [f'"{v}"']
    return []


def queries_for_account(acct: SiteAccount) -> list[str]:
    if not acct.username:
        return []
    return [f'site:{acct.site_domain} "{acct.username}"']


# ---------------------------------------------------------------------------
# Providers (official APIs only)
# ---------------------------------------------------------------------------

def google_cse(query: str, pages: int = 1) -> list[Hit]:
    s = get_settings()
    if not (s.google_cse_key and s.google_cse_cx):
        return []
    hits: list[Hit] = []
    with http.client() as c:
        for page in range(pages):
            r = c.get("https://www.googleapis.com/customsearch/v1",
                      params={"key": s.google_cse_key, "cx": s.google_cse_cx, "q": query, "num": 10,
                              "start": 1 + page * 10})
            if r.status_code != 200:
                raise RuntimeError(f"Google CSE error {r.status_code}: {r.text[:200]}")
            for it in r.json().get("items", []):
                pm = it.get("pagemap", {})
                thumb = (pm.get("cse_thumbnail") or [{}])[0].get("src", "")
                image = (pm.get("cse_image") or [{}])[0].get("src", "")
                hits.append(Hit(url=it["link"], title=it.get("title", ""), snippet=it.get("snippet", ""),
                                thumbnail_url=thumb, image_url=image, source="google_cse", meta={"query": query}))
    return hits


def brave(query: str) -> list[Hit]:
    s = get_settings()
    if not s.brave_api_key:
        return []
    with http.client(headers={"X-Subscription-Token": s.brave_api_key, "Accept": "application/json"}) as c:
        r = c.get("https://api.search.brave.com/res/v1/web/search", params={"q": query, "count": 20})
    if r.status_code != 200:
        raise RuntimeError(f"Brave error {r.status_code}: {r.text[:200]}")
    hits = []
    for it in r.json().get("web", {}).get("results", []):
        hits.append(Hit(url=it["url"], title=it.get("title", ""), snippet=it.get("description", ""),
                        thumbnail_url=(it.get("thumbnail") or {}).get("src", ""), source="brave",
                        meta={"query": query}))
    return hits


_reddit_token: tuple[float, str] | None = None


def reddit_token() -> str:
    """App-only OAuth token (client credentials) for Reddit's official API."""
    global _reddit_token
    s = get_settings()
    if not (s.reddit_client_id and s.reddit_client_secret):
        return ""
    if _reddit_token and _reddit_token[0] > time.time() + 60:
        return _reddit_token[1]
    with http.client() as c:
        r = c.post("https://www.reddit.com/api/v1/access_token", data={"grant_type": "client_credentials"},
                   auth=(s.reddit_client_id, s.reddit_client_secret))
    r.raise_for_status()
    data = r.json()
    _reddit_token = (time.time() + data.get("expires_in", 3600), data["access_token"])
    return _reddit_token[1]


def reddit_api_get(path: str, params: dict | None = None) -> httpx.Response:
    token = reddit_token()
    with http.client(headers={"Authorization": f"bearer {token}"}) as c:
        return c.get(f"https://oauth.reddit.com{path}", params=params or {})


def reddit_user(username: str, max_items: int = 500) -> list[Hit]:
    """All comments and posts of a Reddit user, via the official API."""
    if not reddit_token():
        return []
    hits: list[Hit] = []
    for kind in ("comments", "submitted"):
        after = None
        fetched = 0
        while fetched < max_items:
            r = reddit_api_get(f"/user/{username}/{kind}", {"limit": 100, "after": after, "raw_json": 1})
            if r.status_code == 404:
                return hits  # no such user (deleted / suspended)
            if r.status_code != 200:
                raise RuntimeError(f"Reddit error {r.status_code}")
            listing = r.json()["data"]
            for child in listing["children"]:
                d = child["data"]
                fetched += 1
                url = "https://www.reddit.com" + d["permalink"]
                if kind == "comments":
                    hits.append(Hit(url=url, title=f"Comment in r/{d.get('subreddit')}",
                                    snippet=d.get("body", "")[:1000], source="reddit", content_type_hint="comment",
                                    meta={"subreddit": d.get("subreddit"), "author": d.get("author"),
                                          "fullname": d.get("name"), "created_utc": d.get("created_utc")}))
                else:
                    image = d.get("url_overridden_by_dest", "") if d.get("post_hint") == "image" else ""
                    thumb = d.get("thumbnail", "")
                    hits.append(Hit(url=url, title=d.get("title", ""), snippet=(d.get("selftext") or "")[:1000],
                                    thumbnail_url=thumb if thumb.startswith("http") else "", image_url=image,
                                    source="reddit", content_type_hint="photo" if image else "post",
                                    meta={"subreddit": d.get("subreddit"), "author": d.get("author"),
                                          "fullname": d.get("name"), "created_utc": d.get("created_utc")}))
            after = listing.get("after")
            if not after:
                break
            time.sleep(1)  # stay well under Reddit's rate limits
    return hits


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def save_hits(db: Session, hits: Iterable[Hit], seed_id: int | None = None) -> int:
    new = 0
    for h in hits:
        if not h.url.startswith(("http://", "https://")):
            continue
        if db.scalars(select(Finding).where(Finding.url == h.url)).first():
            continue
        fingerprint = h.snippet.strip()[:200] if h.source == "reddit" else ""
        db.add(Finding(url=h.url, title=h.title[:1000], snippet=h.snippet, thumbnail_url=h.thumbnail_url,
                       image_url=h.image_url, source=h.source, site_domain=domain_of(h.url), seed_id=seed_id,
                       meta=h.meta, content_type=h.content_type_hint or "other", fingerprint=fingerprint))
        new += 1
    db.commit()
    return new


def web_search(query: str) -> list[Hit]:
    hits = google_cse(query)
    hits += brave(query)
    return hits


def run_search_job(db: Session) -> dict:
    """Run every query for every text seed and discovered account. Returns stats."""
    stats = {"queries": 0, "new_findings": 0, "errors": 0}
    seeds = db.scalars(select(Seed).where(Seed.kind != "photo")).all()
    for seed in seeds:
        if seed.kind == "username":
            try:
                stats["new_findings"] += save_hits(db, reddit_user(seed.value), seed.id)
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                log_job(db, "search", f"reddit {seed.value}: {e}")
        for q in queries_for_seed(seed):
            stats["queries"] += 1
            try:
                stats["new_findings"] += save_hits(db, web_search(q), seed.id)
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                log_job(db, "search", f"{q}: {e}")
    for acct in db.scalars(select(SiteAccount)).all():
        for q in queries_for_account(acct):
            stats["queries"] += 1
            try:
                stats["new_findings"] += save_hits(db, web_search(q))
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                log_job(db, "search", f"{q}: {e}")
    log_job(db, "search", f"done: {stats}")
    return stats
