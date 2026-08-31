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
