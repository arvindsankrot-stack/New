from faster_whisper import WhisperModel

from .config import Config

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial Black,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def transcribe_words(config: Config, audio_path: str) -> list:
    model = WhisperModel(config.whisper_model_size, compute_type="int8")
    segments, _ = model.transcribe(audio_path, word_timestamps=True)
    words = []
    for segment in segments:
        for word in segment.words:
            words.append({"text": word.word.strip(), "start": word.start, "end": word.end})
    return words


def _format_ass_time(seconds: float) -> str:
    cs = int(round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass_captions(words: list, out_path: str, words_per_group: int = 4) -> None:
    lines = [ASS_HEADER]
    for i in range(0, len(words), words_per_group):
        group = [w for w in words[i:i + words_per_group] if w["text"]]
        if not group:
            continue
        start = _format_ass_time(group[0]["start"])
        end = _format_ass_time(group[-1]["end"])
        text = " ".join(w["text"] for w in group).upper()
        lines.append(f"Dialogue: 0,{start},{end},Caption,,0,0,0,,{text}\n")
    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
