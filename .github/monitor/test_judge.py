"""Failure text for the self-healing monitor. Run: python3 -m unittest test_judge.py"""
from __future__ import annotations

import json
import unittest

from monitor_lib import judge

HEALTHY = b'{"ok":true,"guardian":"ok"}'
ATTENTION = b'{"ok":true,"guardian":"attention","reason":"90%+ all picks has no SportyBet code. 182 more."}'
NEEDLE = '"guardian":"ok"'


class JudgeTest(unittest.TestCase):
    def test_healthy_body_passes(self):
        ok, detail = judge(200, HEALTHY, "", expect=200, contains=NEEDLE, json_ok_field="ok")
        self.assertTrue(ok)
        self.assertEqual(detail, "200")

    def test_matching_status_names_the_body_field(self):
        ok, detail = judge(200, ATTENTION, "", expect=200, contains=NEEDLE, json_ok_field="ok")
        self.assertFalse(ok)
        self.assertIn('body did not contain "guardian":"ok"', detail)
        self.assertIn('"attention"', detail)
        self.assertIn("SportyBet", detail)
        self.assertNotIn("expected 200", detail)

    def test_status_miss_stays_a_status_miss(self):
        ok, detail = judge(502, b"", "HTTP 502", expect=200)
        self.assertFalse(ok)
        self.assertEqual(detail, "answered 502 (expected 200)")

    def test_no_answer_uses_the_error(self):
        ok, detail = judge(0, b"", "TimeoutError", expect=200)
        self.assertFalse(ok)
        self.assertEqual(detail, "answered TimeoutError (expected 200)")

    def test_json_flag_names_the_value(self):
        body = json.dumps({"ok": False, "reason": "board is empty"}).encode()
        ok, detail = judge(200, body, "", expect=200, json_ok_field="ok")
        self.assertFalse(ok)
        self.assertIn('JSON field ok is false', detail)
        self.assertIn("board is empty", detail)

    def test_json_flag_rejects_non_json(self):
        ok, detail = judge(200, b"<html>", "", expect=200, json_ok_field="ok")
        self.assertFalse(ok)
        self.assertIn("not JSON", detail)


if __name__ == "__main__":
    unittest.main()
