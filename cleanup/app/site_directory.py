"""Starter directory of site contacts. Everything here is editable on the
Sites page; verify each address before sending - companies change them."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

GOOGLE_REFRESH_OUTDATED_URL = "https://search.google.com/search-console/remove-outdated-content"
GOOGLE_RESULTS_ABOUT_YOU_URL = "https://support.google.com/websearch/answer/12719076"

STARTER_SITES = [
    {"domain": "reddit.com", "name": "Reddit", "jurisdiction": "other",
     "self_delete_url": "https://www.reddit.com/settings/account",
     "notes": "Delete own posts/comments from your profile. For content posted by others, message the subreddit moderators first."},
    {"domain": "google.com", "name": "Google", "jurisdiction": "other",
     "self_delete_url": "https://myaccount.google.com/delete-services-or-account",
     "privacy_form_url": GOOGLE_RESULTS_ABOUT_YOU_URL,
     "notes": "Use 'Results about you' for search results with contact info."},
    {"domain": "youtube.com", "name": "YouTube", "jurisdiction": "other",
     "notes": "Use YouTube Studio to delete own videos/comments; privacy complaint process for others' uploads."},
    {"domain": "facebook.com", "name": "Facebook", "jurisdiction": "other",
     "notes": "Meta has a Grievance Officer for India listed in its help centre; add the current address here."},
    {"domain": "instagram.com", "name": "Instagram", "jurisdiction": "other",
     "notes": "Meta has a Grievance Officer for India listed in its help centre; add the current address here."},
    {"domain": "x.com", "name": "X (Twitter)", "jurisdiction": "other",
     "self_delete_url": "https://x.com/settings/deactivate"},
    {"domain": "twitter.com", "name": "X (Twitter)", "jurisdiction": "other",
     "self_delete_url": "https://x.com/settings/deactivate"},
    {"domain": "linkedin.com", "name": "LinkedIn", "jurisdiction": "other"},
    {"domain": "quora.com", "name": "Quora", "jurisdiction": "other"},
    {"domain": "pinterest.com", "name": "Pinterest", "jurisdiction": "other"},
    {"domain": "tumblr.com", "name": "Tumblr", "jurisdiction": "other"},
]


def seed_site_contacts(db: Session) -> None:
    from .db import SiteContact

    existing = set(db.scalars(select(SiteContact.domain)).all())
    for site in STARTER_SITES:
        if site["domain"] not in existing:
            db.add(SiteContact(**site))
    db.commit()
