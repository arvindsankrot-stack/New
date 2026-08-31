import os

import requests

from .config import Config

PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search"


def _search_vertical_video(config: Config, query: str) -> str:
    headers = {"Authorization": config.pexels_api_key}
    params = {"query": query, "orientation": "portrait", "per_page": 5}
    resp = requests.get(PEXELS_SEARCH_URL, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    videos = resp.json().get("videos", [])
    if not videos:
        return ""
    video_files = sorted(videos[0]["video_files"], key=lambda f: f.get("width", 0), reverse=True)
    hd_files = [f for f in video_files if f.get("width", 0) <= 1920]
    chosen = hd_files[0] if hd_files else video_files[0]
    return chosen["link"]


def fetch_scene_footage(config: Config, scenes: list, work_dir: str) -> list:
    """Downloads a licensed Pexels stock clip per scene; adds 'video_path' to each scene dict in place."""
    if not config.pexels_api_key:
        raise RuntimeError("PEXELS_API_KEY is not configured.")
    os.makedirs(work_dir, exist_ok=True)
    for i, scene in enumerate(scenes):
        out_path = os.path.join(work_dir, f"scene_{i:02d}.mp4")
        url = ""
        for keyword in scene.get("visual_keywords", []):
            url = _search_vertical_video(config, keyword)
            if url:
                break
        if not url:
            raise RuntimeError(f"No stock footage found for scene {i}: {scene.get('visual_keywords')}")
        r = requests.get(url, timeout=60, stream=True)
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 16):
                f.write(chunk)
        scene["video_path"] = out_path
    return scenes
