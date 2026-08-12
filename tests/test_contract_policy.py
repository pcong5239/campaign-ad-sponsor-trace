import ast
import json
from pathlib import Path
import unittest


CONTRACT = Path(__file__).parents[1] / "contracts" / "campaign_ad_sponsor_trace.py"


def load_pure_functions():
    tree = ast.parse(CONTRACT.read_text(encoding="utf-8"))
    allowed = {
        "_canonical",
        "_https_host",
        "_artifact_provenance",
        "_valid_fec_id",
        "_normal_text",
        "_terminal_manual_review",
        "_consensus_projection",
    }
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in allowed]
    module = ast.Module(body=nodes, type_ignores=[])
    namespace = {
        "json": json,
        "PLATFORM_HOSTS": ("facebook.com", "www.facebook.com", "adstransparency.google.com"),
    }
    exec(compile(module, str(CONTRACT), "exec"), namespace)
    return namespace


P = load_pure_functions()


class ContractPolicyTests(unittest.TestCase):
    def test_upgrade_source_registers_deployer_and_replaces_code_slot(self):
        tree = ast.parse(CONTRACT.read_text(encoding="utf-8"))
        contract = next(node for node in tree.body if isinstance(node, ast.ClassDef))
        constructor = next(node for node in contract.body if isinstance(node, ast.FunctionDef) and node.name == "__init__")
        upgrade = next(node for node in contract.body if isinstance(node, ast.FunctionDef) and node.name == "upgrade")
        constructor_source = ast.unparse(constructor)
        upgrade_source = ast.unparse(upgrade)
        self.assertIn("root.upgraders.get().append(gl.message.sender_address)", constructor_source)
        self.assertNotIn("upgrader", " ".join(arg.arg for arg in constructor.args.args[1:]))
        self.assertIn("code.truncate()", upgrade_source)
        self.assertIn("code.extend(new_code)", upgrade_source)

    def test_url_provenance_is_derived_not_claimed(self):
        self.assertEqual(P["_artifact_provenance"]("https://www.facebook.com/ads/library/?id=1"), "PLATFORM_LIBRARY")
        self.assertEqual(P["_artifact_provenance"]("https://archive.org/details/ad"), "PUBLIC_ARCHIVE")
        self.assertEqual(P["_artifact_provenance"]("https://registrant.example/ad.png"), "USER_SUBMITTED_URL")
        self.assertEqual(P["_artifact_provenance"]("http://facebook.com/ad"), "INVALID")

    def test_host_parser_rejects_scheme_confusion(self):
        self.assertEqual(P["_https_host"]("https://facebook.com.evil.example/ad"), "facebook.com.evil.example")
        self.assertEqual(P["_artifact_provenance"]("https://facebook.com.evil.example/ad"), "USER_SUBMITTED_URL")

    def test_fec_identifiers_are_exact(self):
        self.assertTrue(P["_valid_fec_id"]("C00123456", "C"))
        self.assertTrue(P["_valid_fec_id"]("H00123456", "H"))
        self.assertFalse(P["_valid_fec_id"]("C0012345", "C"))
        self.assertFalse(P["_valid_fec_id"]("C0012345X", "C"))

    def test_only_compatible_trace_avoids_manual_review(self):
        self.assertFalse(P["_terminal_manual_review"]("COMPATIBLE_FEC_TRACE_FOUND"))
        self.assertTrue(P["_terminal_manual_review"]("UNRESOLVED"))
        self.assertTrue(P["_terminal_manual_review"]("NO_COMPATIBLE_FILING_AS_OF_CUTOFF"))

    def test_canonical_json_is_stable(self):
        left = P["_canonical"]({"b": 2, "a": 1})
        right = P["_canonical"]({"a": 1, "b": 2})
        self.assertEqual(left, right)
        self.assertEqual(left, '{"a":1,"b":2}')

    def test_consensus_ignores_prose_but_rejects_semantic_forgery(self):
        base = {
            "trace_id": 1,
            "revision": 1,
            "verdict": "COMPATIBLE_FEC_TRACE_FOUND",
            "artifact_provenance": "PLATFORM_LIBRARY",
            "artifact_digest": "a" * 64,
            "fec_digest": "b" * 64,
            "matched_transaction_id": "T1",
            "committee_relation": "MATCH",
            "disclaimer_relation": "MATCH",
            "filing_relation": "COMPATIBLE",
            "manual_review_required": False,
            "source_statuses": {"artifact": 200, "committee": 200, "schedule_e": 200},
            "reason": "wording one",
        }
        prose_changed = {**base, "reason": "wording two"}
        forged = {**base, "verdict": "NO_COMPATIBLE_FILING_AS_OF_CUTOFF"}
        self.assertEqual(P["_consensus_projection"](base), P["_consensus_projection"](prose_changed))
        self.assertNotEqual(P["_consensus_projection"](base), P["_consensus_projection"](forged))


if __name__ == "__main__":
    unittest.main()
