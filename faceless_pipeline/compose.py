import os
import subprocess

from .config import Config


def get_duration(path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _prepare_clip(config: Config, scene: dict, index: int, work_dir: str) -> str:
    duration = get_duration(scene["audio_path"])
    out_path = os.path.join(work_dir, f"clip_{index:02d}.mp4")
    vf = (
        f"scale={config.video_width}:{config.video_height}:force_original_aspect_ratio=increase,"
        f"crop={config.video_width}:{config.video_height},setsar=1"
    )
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", scene["video_path"],
            "-t", str(duration),
            "-vf", vf,
            "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            out_path,
        ],
        check=True, capture_output=True,
    )
    return out_path


def _concat(paths: list, out_path: str, work_dir: str) -> None:
    list_path = os.path.join(work_dir, os.path.basename(out_path) + ".txt")
    with open(list_path, "w") as f:
        for p in paths:
            f.write(f"file '{os.path.abspath(p)}'\n")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", out_path],
        check=True, capture_output=True,
    )


def build_silent_video(config: Config, scenes: list, work_dir: str) -> str:
    clip_paths = [_prepare_clip(config, scene, i, work_dir) for i, scene in enumerate(scenes)]
    out_path = os.path.join(work_dir, "silent_video.mp4")
    _concat(clip_paths, out_path, work_dir)
    return out_path


def build_narration_audio(scenes: list, work_dir: str) -> str:
    out_path = os.path.join(work_dir, "narration.mp3")
    _concat([scene["audio_path"] for scene in scenes], out_path, work_dir)
    return out_path


def mux_video_audio(video_path: str, audio_path: str, out_path: str) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
            "-c:v", "copy", "-c:a", "aac", "-shortest", out_path,
        ],
        check=True, capture_output=True,
    )


def burn_captions(video_path: str, ass_path: str, out_path: str) -> None:
    escaped = ass_path.replace("\\", "/").replace(":", "\\:")
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", f"ass={escaped}", "-c:a", "copy", out_path],
        check=True, capture_output=True,
    )
