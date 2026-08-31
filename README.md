# Faceless Video Pipeline

A fully automatic pipeline: it discovers what's currently trending, writes an
original narrated script inspired by (not copied from) that idea, and
publishes the finished vertical video to Instagram Reels. You can also pass
an explicit topic to skip trend discovery.

All content is either AI-generated (trend-inspired script, voiceover) or
sourced from licensed stock footage (Pexels) — nothing is scraped or
reposted from other creators. Trend discovery only reads plain-text search
terms and post titles (never video/media) to decide what subject is worth
talking about.

## Pipeline

```
(no topic given)
  -> trending search terms + Reddit hot post titles   (Google Trends, Reddit - text only)
  -> pick one trend, write an ORIGINAL script inspired by it, not copied     (Anthropic Claude)
       (or: pass an explicit topic to skip trend discovery entirely)
  -> narration audio per scene              (edge-tts)
  -> background video clip per scene        (Pexels stock footage API)
  -> compose: trim/crop clips to vertical 1080x1920, concat, mux narration
  -> word-level transcription of narration  (faster-whisper)
  -> burn in captions                       (ffmpeg + ASS subtitles)
  -> upload final video to S3 (public URL)
  -> create + publish Instagram Reels media container (Graph API)
```

## Requirements

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/) and `ffprobe` on `PATH`
- API keys (see `.env.example`):
  - **Anthropic** — script generation.
  - **Pexels** — free API key at https://www.pexels.com/api/, used for
    stock background footage (all videos are free to use under the Pexels
    License).
  - **Instagram Graph API** — requires:
    1. A Facebook Page linked to an Instagram Business or Creator account.
    2. A Facebook App (developers.facebook.com) with the
       `instagram_content_publish` permission.
    3. A long-lived access token and the Instagram Business Account ID
       (`GET /{page-id}?fields=instagram_business_account`).
  - **AWS S3** — Instagram's API requires a publicly reachable `video_url`
    for the media container, so the rendered video is uploaded to S3 first.
    The bucket needs a policy granting public `s3:GetObject` on the
    `faceless-pipeline/*` prefix (object ACLs are ignored on buckets with
    "Bucket owner enforced" ownership, which is now the default), e.g.:

    ```json
    {
      "Version": "2012-10-17",
      "Statement": [{
        "Sid": "PublicReadFacelessPipeline",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::YOUR_BUCKET/faceless-pipeline/*"
      }]
    }
    ```

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your keys
export $(grep -v '^#' .env | xargs)   # or use a tool like python-dotenv/direnv
```

## Usage

```bash
# Fully automatic: discover a trending topic, write an original script, render, publish
python main.py

# Same, but for a specific trend region
python main.py --region GB

# Explicit topic instead of trend discovery
python main.py "weird facts about deep sea creatures"

# Render only, skip Instagram upload
python main.py --no-publish
```

Output video is written to `output/<title>.mp4`.

## Notes

- Caption style, word grouping, video resolution, and TTS voice are
  configurable in `faceless_pipeline/config.py` / `.env`.
- `faster-whisper` downloads its model on first run; use `WHISPER_MODEL_SIZE`
  to trade off speed vs. accuracy (`tiny`/`base`/`small`/`medium`/`large-v3`).
- Trend sources (`faceless_pipeline/trends.py`) are read-only, low-volume,
  and text-only (Google Trends via `pytrends`, Reddit's public `hot.json`
  endpoint for a few default subreddits). Adjust `DEFAULT_SUBREDDITS` there
  if you want different idea sources. The system prompt explicitly instructs
  Claude to treat trends as inspiration for original writing, never as
  source text to quote or closely paraphrase.
- Instagram's content-publishing API and rate limits change over time —
  check the current [Instagram Content Publishing docs](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
  if `publish_reel` starts failing.
