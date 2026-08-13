"""docs/golden-cases.json をPython実装で検証する。

同じファイルを tests-js/run.mjs がJS実装（public/tools/ppc/engine.js）で検証している。
両方が通る限り、ブラウザ版とサーバ版の数式は一致している。
"""
import json
import pathlib
import unittest

from app.domain.decision_engine import PreflightInput, RuntimeInput, calculate_preflight, evaluate_runtime
from app.domain.keyword_scoring import KeywordInput, OfferEconomics, score_keyword

GOLDEN = pathlib.Path(__file__).resolve().parents[2] / "docs" / "golden-cases.json"


class GoldenCaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(GOLDEN.read_text(encoding="utf-8"))
        cls.tol = cls.data.get("tolerance", 1e-6)

    def assert_close(self, actual, expected, label):
        if isinstance(expected, str):
            self.assertEqual(actual, expected, label)
        else:
            self.assertAlmostEqual(
                actual, expected, delta=max(self.tol, abs(expected) * 1e-5), msg=label
            )

    def test_preflight_cases(self):
        for case in self.data["preflight"]:
            with self.subTest(case=case["name"]):
                result = calculate_preflight(PreflightInput(**case["input"])).to_dict()
                for key, expected in case["expect"].items():
                    self.assert_close(result[key], expected, f"{case['name']} / {key}")

    def test_runtime_cases(self):
        for case in self.data["runtime"]:
            with self.subTest(case=case["name"]):
                result = evaluate_runtime(RuntimeInput(**case["input"])).to_dict()
                for key, expected in case["expect"].items():
                    if key == "improvement_required_gap":
                        actual = result["improvement"]["required_gap"]
                    elif key == "zero_cv_required_affiliate_cvr":
                        actual = result["evidence"]["zero_cv"]["required_affiliate_cvr"]
                    else:
                        actual = result[key]
                    self.assert_close(actual, expected, f"{case['name']} / {key}")

    def test_keyword_cases(self):
        for case in self.data["keyword"]:
            with self.subTest(case=case["name"]):
                offer = OfferEconomics(**case["offer"])
                result = score_keyword(KeywordInput(**case["input"]), offer).to_dict()
                for key, expected in case["expect"].items():
                    self.assert_close(result[key], expected, f"{case['name']} / {key}")


if __name__ == "__main__":
    unittest.main()
