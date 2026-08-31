import json

from google import genai
from google.genai import types

from .config import Config

SYSTEM_PROMPT = """You write short, punchy scripts for faceless short-form vertical videos \
(Instagram Reels / YouTube Shorts), 30-60 seconds when narrated aloud.

Rules:
- 5 to 9 scenes.
- Each scene's narration is 1-2 short sentences, natural to read aloud.
- visual_keywords are 2-4 concrete, literal search terms for stock footage that matches the \
narration (e.g. "ocean waves", "city traffic night"), not abstract concepts.
"""

TREND_SYSTEM_PROMPT = """You write short, punchy scripts for faceless short-form vertical videos \
(Instagram Reels / YouTube Shorts), 30-60 seconds when narrated aloud.

You will be given a list of topics/headlines that are currently trending. Pick the ONE most \
interesting or engaging idea from the list as your inspiration, then write a completely \
ORIGINAL script about that general subject in your own words. Never quote, closely paraphrase, \
or reproduce any specific claim, joke, story detail, or wording from the list verbatim - use \
each item only to choose a subject and angle worth talking about, then write fresh content \
around it. Report which item you picked as chosen_trend.

Rules:
- 5 to 9 scenes.
- Each scene's narration is 1-2 short sentences, natural to read aloud.
- visual_keywords are 2-4 concrete, literal search terms for stock footage that matches the \
narration (e.g. "ocean waves", "city traffic night"), not abstract concepts.
"""

_SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "narration": {"type": "string"},
        "visual_keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["narration", "visual_keywords"],
}


def _script_schema(include_trend: bool = False) -> dict:
    properties = {
        "title": {"type": "string"},
        "caption": {"type": "string"},
        "scenes": {"type": "array", "items": _SCENE_SCHEMA},
    }
    required = ["title", "caption", "scenes"]
    if include_trend:
        properties["chosen_trend"] = {"type": "string"}
        required.insert(0, "chosen_trend")
    return {"type": "object", "properties": properties, "required": required}


def _generate(config: Config, system_prompt: str, user_content: str, schema: dict) -> dict:
    if not config.google_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Get a key from Google AI Studio "
            "(https://aistudio.google.com/apikey)."
        )
    client = genai.Client(api_key=config.google_api_key)
    response = client.models.generate_content(
        model=config.gemini_model,
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=schema,
            # Gemini 2.5 models think by default and thinking tokens count against this
            # budget, so keep it well above the size of the script itself.
            max_output_tokens=8192,
        ),
    )
    if not response.text:
        raise RuntimeError(f"Gemini returned no text. Full response: {response}")
    return json.loads(response.text)


def generate_script(config: Config, topic: str) -> dict:
    return _generate(config, SYSTEM_PROMPT, f"Topic: {topic}", _script_schema())


def generate_script_from_trends(config: Config, trending_topics: list) -> dict:
    topics_block = "\n".join(f"- {t}" for t in trending_topics)
    return _generate(
        config,
        TREND_SYSTEM_PROMPT,
        f"Trending topics:\n{topics_block}",
        _script_schema(include_trend=True),
    )
