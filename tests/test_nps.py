import pytest
from nps import calculate_nps


def test_calculate_nps_basic():
    scores = [10, 9, 9, 7, 5, 6]
    # promoters=3, detractors=2 => (3-2)/6*100=16.666...
    result = calculate_nps(scores)
    assert round(result, 2) == 16.67


def test_calculate_nps_invalid_range():
    with pytest.raises(ValueError):
        calculate_nps([11])


def test_calculate_nps_empty():
    with pytest.raises(ValueError):
        calculate_nps([])
