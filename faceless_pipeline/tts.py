import asyncio
import os

import edge_tts

from .config import Config


async def _synthesize(text: str, voice: str, out_path: str) -> None:
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)


def synthesize_scene_audio(config: Config, scenes: list, work_dir: str) -> list:
    """Synthesizes narration audio for each scene; adds 'audio_path' to each scene dict in place."""
    os.makedirs(work_dir, exist_ok=True)
    for i, scene in enumerate(scenes):
        out_path = os.path.join(work_dir, f"scene_{i:02d}.mp3")
        asyncio.run(_synthesize(scene["narration"], config.tts_voice, out_path))
        scene["audio_path"] = out_path
    return scenes
