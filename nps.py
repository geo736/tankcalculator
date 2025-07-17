#!/usr/bin/env python3
"""Net Promoter Score calculator."""

from __future__ import annotations

import argparse
from typing import Iterable, Sequence


def calculate_nps(scores: Sequence[int]) -> float:
    """Calculate the Net Promoter Score from survey responses.

    Args:
        scores: Iterable of integer scores from 0 to 10.

    Returns:
        Net Promoter Score as a float between -100 and 100.

    Raises:
        ValueError: If the score list is empty or contains invalid values.
    """
    if not scores:
        raise ValueError("Scores list cannot be empty")

    promoters = detractors = 0
    for score in scores:
        if not 0 <= score <= 10:
            raise ValueError("Scores must be between 0 and 10")
        if score >= 9:
            promoters += 1
        elif score <= 6:
            detractors += 1

    nps = (promoters - detractors) / len(scores) * 100
    return float(nps)


def _parse_args(args: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calculate Net Promoter Score")
    parser.add_argument(
        "scores",
        nargs="*",
        type=int,
        help="List of scores (0-10)",
    )
    parser.add_argument(
        "-f",
        "--file",
        type=str,
        help="File containing one score per line",
    )
    return parser.parse_args(args)


def main(argv: Sequence[str] | None = None) -> None:
    args = _parse_args(argv)

    scores: list[int] = []
    if args.file:
        with open(args.file) as f:
            for line in f:
                line = line.strip()
                if line:
                    scores.append(int(line))
    scores.extend(args.scores)

    nps = calculate_nps(scores)
    print(f"NPS: {nps:.2f}")


if __name__ == "__main__":
    main()
