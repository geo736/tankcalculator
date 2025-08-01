# nps.py
"""Net Promoter Score calculator CLI"""

from __future__ import annotations
import argparse


def calculate_nps(scores: list[int]) -> float:
    """Calculate the Net Promoter Score from a list of ratings (0-10)."""
    if not scores:
        raise ValueError("Score list cannot be empty")
    for score in scores:
        if score < 0 or score > 10:
            raise ValueError("Scores must be between 0 and 10 inclusive")

    promoters = sum(1 for s in scores if s >= 9)
    detractors = sum(1 for s in scores if s <= 6)
    nps = (promoters - detractors) / len(scores) * 100
    return nps


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scores",
        nargs="+",
        type=int,
        help="List of integer scores 0-10",
    )
    args = parser.parse_args(argv)
    nps = calculate_nps(args.scores)
    print(f"Net Promoter Score: {nps:.2f}")


if __name__ == "__main__":
    main()
