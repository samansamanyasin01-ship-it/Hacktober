"""
Test and verify the CaseBoard AI backend pipeline:
1. Seed database without Sara
2. Verify baseline contradictions (Hamza phone ping vs alibi, Nadia Stmt 1 vs Stmt 2)
3. Ingest Sara's statement chunks (simulating live interview)
4. Verify all 4 planted contradictions are detected
5. Verify 10:45 to 11:15 PM timeline gap is present
6. Verify anti-hallucination quote validation
"""

import sys
import os
import json

sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, get_connection
from seed_data import seed_database, SARA_LIVE_CHUNKS, SARA_STATEMENT, ingest_document
from contradiction_engine import run_contradiction_pipeline
from validation import validate_verbatim_quote
from ai_service import summarize_case, suggest_leads

def run_tests():
    print("=== STEP 1: INITIALIZE DB & SEED BASELINE ===")
    init_db()
    seed_database(include_sara=False)
    
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT count(*) FROM facts")
    facts_count = c.fetchone()[0]
    c.execute("SELECT count(*) FROM contradictions")
    contra_count = c.fetchone()[0]
    print(f"Baseline loaded: {facts_count} facts, {contra_count} contradictions.")

    print("\n=== STEP 2: TEST VERBATIM QUOTE VALIDATION (ANTI-HALLUCINATION) ===")
    source = "I worked normal shift until 9:00 PM yesterday. I closed my desk and left at 9:00 PM sharp."
    valid_quote = "left at 9:00 PM sharp"
    hallucinated_quote = "I went home immediately because I was feeling very tired"
    
    ok1, msg1 = validate_verbatim_quote(valid_quote, source)
    ok2, msg2 = validate_verbatim_quote(hallucinated_quote, source)
    print(f"Valid quote check: {ok1} -> {msg1}")
    print(f"Hallucinated quote check: {ok2} -> {msg2}")
    assert ok1 is True, "Valid quote failed!"
    assert ok2 is False, "Hallucinated quote was not rejected!"
    print("Anti-hallucination check PASSED.")

    print("\n=== STEP 3: SIMULATE SARA'S LIVE INTERVIEW INTAKE ===")
    # Ingest Sara's statement
    ingest_document(
        SARA_STATEMENT["id"],
        SARA_STATEMENT["person_id"],
        SARA_STATEMENT["type"],
        SARA_STATEMENT["title"],
        SARA_STATEMENT["text"],
        SARA_STATEMENT["added_by"],
        SARA_STATEMENT["added_at"]
    )
    new_contras = run_contradiction_pipeline("CASE-2026-001")
    print(f"Pipeline executed after Sara's intake. New contradictions detected: {len(new_contras)}")

    # Check all contradictions in DB
    c.execute("SELECT id, type, explanation FROM contradictions WHERE case_id = 'CASE-2026-001'")
    all_contras = c.fetchall()
    print(f"\nTotal contradictions in case: {len(all_contras)}")
    for row in all_contras:
        print(f" - [{row['type'].upper()}] {row['id']}: {row['explanation']}")

    # Verify our 4 planted contradictions are all captured
    found_ali_car = any("honda civic" in r["explanation"].lower() or "gulberg" in r["explanation"].lower() for r in all_contras)
    found_hamza_ping = any("tower" in r["explanation"].lower() or "carrier" in r["explanation"].lower() or "islamabad" in r["explanation"].lower() for r in all_contras)
    found_nadia = any("nadia" in r["explanation"].lower() or "argument" in r["explanation"].lower() for r in all_contras)
    found_cctv = any("cctv" in r["explanation"].lower() or "cam-02" in r["explanation"].lower() or "camera" in r["explanation"].lower() for r in all_contras)

    print(f"\nPlanted Contradiction #1 (Ali Car vs Gulberg Alibi): {'FOUND' if found_ali_car else 'MISSING'}")
    print(f"Planted Contradiction #2 (Hamza Phone Ping vs Islamabad Alibi): {'FOUND' if found_hamza_ping else 'MISSING'}")
    print(f"Planted Contradiction #3 (Nadia Stmt 1 Quiet vs Stmt 2 Argument): {'FOUND' if found_nadia else 'MISSING'}")
    print(f"Planted Contradiction #4 (Sara Camera Working vs CCTV Offline Log): {'FOUND' if found_cctv else 'MISSING'}")

    assert found_ali_car and found_hamza_ping and found_nadia and found_cctv, "Not all planted contradictions were captured!"

    print("\n=== STEP 4: VERIFY LEADS & 10:45 - 11:15 GAP ===")
    c.execute("SELECT * FROM facts WHERE case_id = 'CASE-2026-001'")
    facts = [dict(r) for r in c.fetchall()]
    contras = [dict(r) for r in all_contras]
    leads = suggest_leads(facts, contras)
    gap_found = any("10:45" in l["suggestion"] or "10:45" in l["reason"] for l in leads)
    print(f"Timeline Gap (10:45 - 11:15 PM) in Leads: {'IDENTIFIED' if gap_found else 'MISSING'}")
    assert gap_found, "Timeline gap 10:45-11:15 not identified in leads!"

    print("\n=== STEP 5: VERIFY CITED CASE SUMMARY ===")
    c.execute("SELECT * FROM documents WHERE case_id = 'CASE-2026-001'")
    docs = [dict(r) for r in c.fetchall()]
    summary = summarize_case(facts, contras, docs)
    print("Summary preview:")
    for line in summary.split("\n")[:8]:
        print("  " + line)
    has_citations = "[F1]" in summary and "[S1]" in summary
    print(f"Citations in summary: {'VERIFIED' if has_citations else 'MISSING'}")
    assert has_citations, "Citations missing from summary!"

    print("\n>>> ALL BACKEND TESTS PASSED SUCCESSFULLY! <<<")
    conn.close()

if __name__ == "__main__":
    run_tests()
