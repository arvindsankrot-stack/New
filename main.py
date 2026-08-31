import argparse

from faceless_pipeline.pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a faceless short-form video from a topic and optionally publish it to Instagram Reels."
    )
    parser.add_argument(
        "topic",
        nargs="?",
        default=None,
        help=(
            "Optional topic or prompt for the video, e.g. 'weird facts about deep sea creatures'. "
            "If omitted, the pipeline auto-discovers a currently trending topic and writes an "
            "original script inspired by it."
        ),
    )
    parser.add_argument("--region", default="US", help="Region code for trend discovery (e.g. US, GB, IN)")
    parser.add_argument("--no-publish", action="store_true", help="Only render the video, skip uploading to Instagram")
    args = parser.parse_args()

    run_pipeline(args.topic, region=args.region, publish=not args.no_publish)


if __name__ == "__main__":
    main()
