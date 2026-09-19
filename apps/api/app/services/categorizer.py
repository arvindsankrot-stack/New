"""
Keyword-based vendor categorizer.

Used as (a) the sole categorizer in the regex fallback parser, and (b) a
sanity check on the LLM's category guess — the LLM is generally accurate,
but a lightweight deterministic backstop keeps obviously-known vendors
(Netflix, AWS, ...) from being miscategorized by an off day in the model.
"""

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "streaming": [
        "netflix", "hulu", "disney+", "disney plus", "spotify", "apple music",
        "youtube premium", "youtube tv", "hbo", "max", "paramount+", "peacock",
        "amazon prime video", "crunchyroll", "audible", "tidal", "espn+",
    ],
    "utilities": [
        "electric", "electricity", "power company", "water utility", "gas company",
        "internet", "broadband", "comcast", "xfinity", "spectrum", "at&t", "verizon",
        "t-mobile", "phone bill", "wireless", "utility",
    ],
    "saas": [
        "aws", "amazon web services", "google cloud", "azure", "github", "gitlab",
        "notion", "slack", "zoom", "dropbox", "adobe", "figma", "openai", "anthropic",
        "microsoft 365", "office 365", "salesforce", "hubspot", "vercel", "heroku",
        "digitalocean", "canva", "mailchimp", "zapier", "asana", "trello", "1password",
        "linear", "jira",
    ],
    "personal_services": [
        "gym", "fitness", "planet fitness", "equinox", "peloton", "meal kit",
        "hellofresh", "blue apron", "dating", "tinder", "bumble", "hinge",
        "therapy", "betterhelp", "headspace", "calm", "class pass", "classpass",
        "nytimes", "new york times", "wsj", "wall street journal", "medium",
    ],
}


def categorize_vendor(vendor_name: str) -> str:
    lowered = vendor_name.lower()
    for category, keywords in _CATEGORY_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return category
    return "other"


def normalize_vendor_name(vendor_name: str) -> str:
    """
    Collapses statement noise ("SQ *NETFLIX.COM 866-579", "NETFLIX.COM") down
    to a stable key ("netflix") used for de-duplication and cancellation-guide
    lookups.
    """
    import re

    lowered = vendor_name.lower().strip()
    lowered = re.sub(r"^(sq|tst|sp|pos)\s*\*\s*", "", lowered)
    lowered = re.sub(r"\.(com|net|org|io)\b", "", lowered)
    lowered = re.sub(r"[\d#*]{4,}", "", lowered)  # strip long numeric/ref codes
    lowered = re.sub(r"[^a-z0-9+&\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered
