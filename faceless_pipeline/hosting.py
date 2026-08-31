import os
import uuid

import boto3

from .config import Config


def upload_and_get_public_url(config: Config, file_path: str) -> str:
    """Uploads the rendered video to S3 and returns its public URL.

    Instagram's Graph API requires a publicly reachable video_url for the media
    container, not a direct file upload, so the bucket must permit public reads
    (via bucket policy - see README) rather than relying on object ACLs.
    """
    if not config.s3_bucket:
        raise RuntimeError(
            "S3_BUCKET is not configured; a public URL is required to publish to Instagram."
        )
    s3 = boto3.client("s3", region_name=config.s3_region)
    key = f"faceless-pipeline/{uuid.uuid4().hex}{os.path.splitext(file_path)[1]}"
    s3.upload_file(file_path, config.s3_bucket, key, ExtraArgs={"ContentType": "video/mp4"})
    return f"https://{config.s3_bucket}.s3.{config.s3_region}.amazonaws.com/{key}"
