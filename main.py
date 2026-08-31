import argparse

from faceless_pipeline.pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a faceless short-form video from a topic and optionally publish it to Instagram Reels."
    )
    parser.add_argument("topic", help="Topic or prompt for the video, e.g. 'weird facts about deep sea creatures'")
    parser.add_argument("--no-publish", action="store_true", help="Only render the video, skip uploading to Instagram")
    args = parser.parse_args()

    run_pipeline(args.topic, publish=not args.no_publish)


if __name__ == "__main__":
    main()
