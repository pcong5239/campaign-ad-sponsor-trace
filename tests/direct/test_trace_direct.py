import hashlib
import json
from pathlib import Path


CONTRACT = Path(__file__).parents[2] / "contracts" / "campaign_ad_sponsor_trace.py"


ARTIFACT = b"exact archived ad bytes"


def _create(contract, digest=None):
    return contract.create_trace(
        "https://archive.org/details/example-ad",
        digest or hashlib.sha256(ARTIFACT).hexdigest(),
        "Paid for by Example Committee",
        "H00123456",
        2026,
        "C00123456",
        "S",
        1,
        2,
    )


def _mock_sources(
    direct_vm,
    artifact_status=200,
    llm_verdict="COMPATIBLE_FEC_TRACE_FOUND",
    schedule_pages=1,
):
    direct_vm.mock_web(
        r".*archive\.org/details/example-ad.*",
        {"status": artifact_status, "body": ARTIFACT if artifact_status == 200 else b""},
    )
    direct_vm.mock_web(
        r".*api\.open\.fec\.gov/v1/committee/C00123456/.*",
        {
            "status": 200,
            "body": json.dumps({"results": [{"committee_id": "C00123456", "name": "Example Committee"}]}),
        },
    )
    direct_vm.mock_web(
        r".*api\.open\.fec\.gov/v1/schedules/schedule_e/.*",
        {
            "status": 200,
            "body": json.dumps({"pagination": {"pages": schedule_pages, "count": schedule_pages}, "results": [{
                "transaction_id": "T1",
                "committee_id": "C00123456",
                "candidate_id": "H00123456",
                "support_oppose_indicator": "S",
                "expenditure_date": "1970-01-01",
            }]}),
        },
    )
    model = {
        "verdict": llm_verdict,
        "committee_relation": "MATCH",
        "disclaimer_relation": "MATCH",
        "filing_relation": "COMPATIBLE" if llm_verdict == "COMPATIBLE_FEC_TRACE_FOUND" else "NONE",
        "matched_transaction_id": "T1" if llm_verdict == "COMPATIBLE_FEC_TRACE_FOUND" else "",
        "reason": "TEST_RESULT",
    }
    direct_vm.mock_llm(r".*matching a frozen federal independent-expenditure ad claim.*", json.dumps(model))


def test_create_freeze_and_owner_authorization(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = direct_deploy(str(CONTRACT))
    trace_id = _create(contract)
    assert int(trace_id) == 1
    assert '"state":"DRAFT"' in contract.get_trace(trace_id)

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the trace owner can freeze it"):
            contract.freeze_trace(trace_id)

    contract.freeze_trace(trace_id)
    assert '"state":"FROZEN"' in contract.get_trace(trace_id)


def test_upgrade_rejects_non_upgrader(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = direct_deploy(str(CONTRACT))
    assert contract.get_upgrader().as_hex.lower() == f"0x{direct_alice.hex()}"
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the recorded upgrader can replace code"):
            contract.upgrade(CONTRACT.read_bytes())
    contract.upgrade(CONTRACT.read_bytes())


def test_assessment_agreement_and_validator_disagreement(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(str(CONTRACT))
    trace_id = _create(contract)
    contract.freeze_trace(trace_id)
    _mock_sources(direct_vm)

    contract.assess_trace(trace_id)
    assessment = json.loads(contract.get_latest_assessment(trace_id))
    assert assessment["verdict"] == "COMPATIBLE_FEC_TRACE_FOUND", json.dumps(assessment, sort_keys=True)
    assert assessment["matched_transaction_id"] == "T1"
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    _mock_sources(direct_vm, llm_verdict="NO_COMPATIBLE_FILING_AS_OF_CUTOFF")
    assert direct_vm.run_validator() is False


def test_unavailable_artifact_fails_safe(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(str(CONTRACT))
    trace_id = _create(contract)
    contract.freeze_trace(trace_id)
    _mock_sources(direct_vm, artifact_status=503)

    contract.assess_trace(trace_id)
    assessment = json.loads(contract.get_latest_assessment(trace_id))
    assert assessment["verdict"] == "UNRESOLVED"
    assert assessment["reason"] == "ARTIFACT_UNAVAILABLE"


def test_truncated_fec_result_set_fails_safe(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(str(CONTRACT))
    trace_id = _create(contract)
    contract.freeze_trace(trace_id)
    _mock_sources(direct_vm, schedule_pages=2)

    contract.assess_trace(trace_id)
    assessment = json.loads(contract.get_latest_assessment(trace_id))
    assert assessment["verdict"] == "UNRESOLVED"
    assert assessment["reason"] == "FEC_RESULT_SET_TRUNCATED"
