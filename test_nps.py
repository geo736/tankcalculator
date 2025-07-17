import unittest
from nps import calculate_nps


class TestCalculateNPS(unittest.TestCase):
    def test_basic(self):
        scores = [0, 5, 7, 8, 9, 10]
        self.assertEqual(calculate_nps(scores), 0.0)

    def test_all_promoters(self):
        scores = [9, 10, 10, 9]
        self.assertEqual(calculate_nps(scores), 100.0)

    def test_all_detractors(self):
        scores = [0, 1, 2, 3, 4, 5, 6]
        self.assertEqual(calculate_nps(scores), -100.0)

    def test_empty(self):
        with self.assertRaises(ValueError):
            calculate_nps([])

    def test_invalid_values(self):
        with self.assertRaises(ValueError):
            calculate_nps([11, -1])


if __name__ == "__main__":
    unittest.main()
