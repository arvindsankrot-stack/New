import os

from .captions import build_ass_captions, transcribe_words
from .compose import build_narration_audio, build_silent_video, burn_captions, mux_video_audio
from .config import Config, load_config
from .footage import fetch_scene_footage
from .hosting import upload_and_get_public_url
from .publish_instagram import publish_reel
from .script_gen import generate_script, generate_script_from_trends
from .trends import fetch_trending_topics
from .tts import synthesize_scene_audio


def run_pipeline(
    topic: str = None,
    region: str = "US",
    publish: bool = True,
    config: Config = None,
) -> dict:
    """If topic is None, the pipeline auto-discovers currently trending topics
    (Google Trends + Reddit hot post titles - text only) and has Claude pick one
    as inspiration for an original script, making the whole run fully automatic.
    """
    config = config or load_config()
    work_dir = os.path.join(config.output_dir, "work")
    os.makedirs(config.output_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)

    if topic is None:
        print(f"[1/8] Discovering trending topics (region={region})")
        trending = fetch_trending_topics(config, region=region)
        print(f"  Candidates: {trending}")
        script = generate_script_from_trends(config, trending)
        print(f"  Chosen inspiration: {script.get('chosen_trend')}")
    else:
        print(f"[1/8] Generating script for: {topic}")
        script = generate_script(config, topic)
    scenes = script["scenes"]

    print(f"[2/8] Synthesizing narration ({len(scenes)} scenes)")
    synthesize_scene_audio(config, scenes, work_dir)

    print(f"[3/8] Sourcing licensed stock footage ({len(scenes)} scenes)")
    fetch_scene_footage(config, scenes, work_dir)

    print("[4/8] Composing video")
    silent_video = build_silent_video(config, scenes, work_dir)
    narration_audio = build_narration_audio(scenes, work_dir)
    muxed_video = os.path.join(work_dir, "muxed.mp4")
    mux_video_audio(silent_video, narration_audio, muxed_video)

    print("[5/8] Transcribing narration for captions")
    words = transcribe_words(config, narration_audio)
    ass_path = os.path.join(work_dir, "captions.ass")
    build_ass_captions(words, ass_path)

    print("[6/8] Burning in captions")
    safe_title = "".join(c if c.isalnum() or c in " -_" else "" for c in script["title"])[:50].strip().replace(" ", "_")
    final_video = os.path.join(config.output_dir, f"{safe_title or 'video'}.mp4")
    burn_captions(muxed_video, ass_path, final_video)
    print(f"Final video: {final_video}")

    result = {"title": script["title"], "caption": script["caption"], "video_path": final_video}

    if publish:
        print("[7/8] Uploading and publishing to Instagram Reels")
        video_url = upload_and_get_public_url(config, final_video)
        media_id = publish_reel(config, video_url, script["caption"])
        result["instagram_media_id"] = media_id
        print(f"Published to Instagram: media id {media_id}")
    else:
        print("[7/8] Skipping publish (--no-publish)")

    return result
