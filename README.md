# Net Promoter Score Calculator

This repository contains a simple command line tool for calculating the
Net Promoter Score (NPS).

## Usage

```
python nps.py 10 9 8 7 6
```

The command accepts scores between 0 and 10. The resulting NPS is printed
as a percentage. The NPS is computed as:

```
((number_of_promoters - number_of_detractors) / total_responses) * 100
```

Promoters are scores of 9 or 10. Detractors are scores of 6 or lower.
All other scores are considered passives and do not affect the score.
