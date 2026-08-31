import requests
from pytrends.request import TrendReq

from .config import Config

DEFAULT_SUBREDDITS = ["todayilearned", "interestingasfuck", "AskReddit"]

_REGION_MAP = {
    "US": "united_states",
    "GB": "united_kingdom",
    "UK": "united_kingdom",
    "IN": "india",
    "CA": "canada",
    "AU": "australia",
}


def _fetch_google_trending(region: str, limit: int) -> list:
    """Returns currently trending search terms (text only) for a region."""
    try:
        pytrends = TrendReq(hl="en-US", tz=360)
        pn = _REGION_MAP.get(region.upper(), "united_states")
        df = pytrends.trending_searches(pn=pn)
        return [str(t) for t in df[0].tolist()[:limit]]
    except Exception:
        return []


def _fetch_reddit_hot_titles(subreddits: list, limit_per_sub: int = 5) -> list:
    """Returns hot post titles (text only, no media fetched) from a small set of subreddits."""
    titles = []
    headers = {"User-Agent": "faceless-video-pipeline/1.0 (topic idea discovery)"}
    for sub in subreddits:
        try:
            resp = requests.get(
                f"https://www.reddit.com/r/{sub}/hot.json",
                headers=headers,
                params={"limit": limit_per_sub},
                timeout=15,
            )
            resp.raise_for_status()
            for child in resp.json()["data"]["children"]:
                post = child["data"]
                if not post.get("over_18") and not post.get("stickied"):
                    titles.append(post["title"])
        except Exception:
            continue
    return titles


def fetch_trending_topics(config: Config, region: str = "US", limit: int = 15) -> list:
    """Returns a deduplicated list of candidate topic ideas from Google Trends and Reddit
    hot post titles. Only plain-text titles/search terms are fetched here - no video or
    other media is downloaded from these sources; they exist purely to surface what
    subjects are currently getting attention, for the script writer to draw inspiration
    from and write original narration about.
    """
    topics = []
    topics.extend(_fetch_google_trending(region, limit))
    topics.extend(_fetch_reddit_hot_titles(DEFAULT_SUBREDDITS))

    seen = set()
    deduped = []
    for t in topics:
        key = t.lower().strip()
        if key and key not in seen:
            seen.add(key)
            deduped.append(t)

    if not deduped:
        raise RuntimeError("No trending topics could be fetched from any source.")
    return deduped[:limit]
