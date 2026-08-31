import json

import anthropic

from .config import Config

SYSTEM_PROMPT = """You write short, punchy scripts for faceless short-form vertical videos \
(Instagram Reels / YouTube Shorts), 30-60 seconds when narrated aloud.

Return ONLY valid JSON with this shape:
{
  "title": "short catchy title",
  "caption": "social media caption with relevant hashtags",
  "scenes": [
    {"narration": "one or two sentences of narration for this scene", "visual_keywords": ["keyword1", "keyword2"]}
  ]
}

Rules:
- 5 to 9 scenes.
- Each scene's narration is 1-2 short sentences, natural to read aloud.
- visual_keywords are 2-4 concrete, literal search terms for stock footage that matches the \
narration (e.g. "ocean waves", "city traffic night"), not abstract concepts.
- No markdown, no commentary, JSON only.
"""


def generate_script(config: Config, topic: str) -> dict:
    if not config.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    client = anthropic.Anthropic(api_key=config.anthropic_api_key)
    message = client.messages.create(
        model=config.anthropic_model,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Topic: {topic}"}],
    )
    text = "".join(block.text for block in message.content if block.type == "text")
    return json.loads(text)


TREND_SYSTEM_PROMPT = """You write short, punchy scripts for faceless short-form vertical videos \
(Instagram Reels / YouTube Shorts), 30-60 seconds when narrated aloud.

You will be given a list of topics/headlines that are currently trending. Pick the ONE most \
interesting or engaging idea from the list as your inspiration, then write a completely \
ORIGINAL script about that general subject in your own words. Never quote, closely paraphrase, \
or reproduce any specific claim, joke, story detail, or wording from the list verbatim - use \
each item only to choose a subject and angle worth talking about, then research and write \
fresh content around it.

Return ONLY valid JSON with this shape:
{
  "chosen_trend": "the trending item you picked as inspiration",
  "title": "short catchy title",
  "caption": "social media caption with relevant hashtags",
  "scenes": [
    {"narration": "one or two sentences of narration for this scene", "visual_keywords": ["keyword1", "keyword2"]}
  ]
}

Rules:
- 5 to 9 scenes.
- Each scene's narration is 1-2 short sentences, natural to read aloud.
- visual_keywords are 2-4 concrete, literal search terms for stock footage that matches the \
narration (e.g. "ocean waves", "city traffic night"), not abstract concepts.
- No markdown, no commentary, JSON only.
"""


def generate_script_from_trends(config: Config, trending_topics: list) -> dict:
    if not config.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    client = anthropic.Anthropic(api_key=config.anthropic_api_key)
    topics_block = "\n".join(f"- {t}" for t in trending_topics)
    message = client.messages.create(
        model=config.anthropic_model,
        max_tokens=2000,
        system=TREND_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Trending topics:\n{topics_block}"}],
    )
    text = "".join(block.text for block in message.content if block.type == "text")
    return json.loads(text)
