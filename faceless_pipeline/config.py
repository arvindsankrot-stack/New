import os
from dataclasses import dataclass


@dataclass
class Config:
    anthropic_api_key: str
    anthropic_model: str

    pexels_api_key: str

    tts_voice: str

    whisper_model_size: str

    ig_access_token: str
    ig_business_account_id: str

    s3_bucket: str
    s3_region: str

    output_dir: str
    video_width: int = 1080
    video_height: int = 1920


def load_config() -> Config:
    return Config(
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5"),
        pexels_api_key=os.environ.get("PEXELS_API_KEY", ""),
        tts_voice=os.environ.get("TTS_VOICE", "en-US-GuyNeural"),
        whisper_model_size=os.environ.get("WHISPER_MODEL_SIZE", "base"),
        ig_access_token=os.environ.get("IG_ACCESS_TOKEN", ""),
        ig_business_account_id=os.environ.get("IG_BUSINESS_ACCOUNT_ID", ""),
        s3_bucket=os.environ.get("S3_BUCKET", ""),
        s3_region=os.environ.get("AWS_REGION", "us-east-1"),
        output_dir=os.environ.get("OUTPUT_DIR", "output"),
    )
