import time

import requests

from .config import Config

GRAPH_API_BASE = "https://graph.facebook.com/v19.0"


def publish_reel(
    config: Config,
    video_url: str,
    caption: str,
    poll_interval: float = 5.0,
    timeout: float = 600.0,
) -> str:
    if not config.ig_access_token or not config.ig_business_account_id:
        raise RuntimeError(
            "IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID must be set to publish to Instagram."
        )

    create_resp = requests.post(
        f"{GRAPH_API_BASE}/{config.ig_business_account_id}/media",
        data={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "access_token": config.ig_access_token,
        },
        timeout=30,
    )
    create_resp.raise_for_status()
    creation_id = create_resp.json()["id"]

    deadline = time.monotonic() + timeout
    status_code = None
    while time.monotonic() < deadline:
        status_resp = requests.get(
            f"{GRAPH_API_BASE}/{creation_id}",
            params={"fields": "status_code,status", "access_token": config.ig_access_token},
            timeout=30,
        )
        status_resp.raise_for_status()
        status = status_resp.json()
        status_code = status.get("status_code")
        if status_code == "FINISHED":
            break
        if status_code == "ERROR":
            raise RuntimeError(f"Instagram failed to process the video: {status}")
        time.sleep(poll_interval)
    if status_code != "FINISHED":
        raise TimeoutError("Timed out waiting for Instagram to finish processing the video container.")

    publish_resp = requests.post(
        f"{GRAPH_API_BASE}/{config.ig_business_account_id}/media_publish",
        data={"creation_id": creation_id, "access_token": config.ig_access_token},
        timeout=30,
    )
    publish_resp.raise_for_status()
    return publish_resp.json()["id"]
