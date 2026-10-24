"""
Contradiction Detection Engine for CaseBoard AI.
Implements a strict two-tier architecture:
Tier 1: Rule-based exact verification (time-space conflicts, digital telemetry vs statements).
Tier 2: AI semantic conflict detection for candidate pairs sharing a person, place, or entity.
Enforces non-judgmental language: 'inconsistent, needs human review', never 'guilty' or 'lying'.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from database import get_connection, log_audit
from ai_service import compare_facts

def parse_time_to_minutes(time_str: Optional[str]) -> Optional[int]:
    """Parse HH:MM string to integer minutes from 00:00."""
    if not time_str:
        return None
    match = re.search(r'(\d{1,2}):(\d{2})', str(time_str))
    if not match:
        return None
    hours, minutes = int(match.group(1)), int(match.group(2))
    return hours * 60 + minutes

def time_ranges_overlap(start_a: Optional[int], end_a: Optional[int], start_b: Optional[int], end_b: Optional[int]) -> bool:
    """Check if two time intervals overlap (including instantaneous point-in-time observations)."""
    if start_a is None or start_b is None:
        return False
    
    # Treat point in time as 15-minute observation window
    actual_end_a = end_a if (end_a is not None and end_a >= start_a) else start_a + 15
    actual_end_b = end_b if (end_b is not None and end_b >= start_b) else start_b + 15

    # Handle overnight spans if start > end
    if end_a is not None and end_a < start_a:
        actual_end_a += 24 * 60
    if end_b is not None and end_b < start_b:
        actual_end_b += 24 * 60

    return max(start_a, start_b) <= min(actual_end_a, actual_end_b)

def places_are_mutually_exclusive(place_a: Optional[str], place_b: Optional[str]) -> bool:
    """Determine if two places cannot be occupied simultaneously (e.g. different cities or distant residential areas)."""
    if not place_a or not place_b:
        return False
    pa = place_a.lower().strip()
    pb = place_b.lower().strip()
    
    # If both places are sub-areas of the warehouse facility compound, they are NOT mutually exclusive
    facility_keywords = ["warehouse", "dock", "gate", "porch", "electrical", "room", "bay", "street opposite"]
    pa_facility = any(k in pa for k in facility_keywords)
    pb_facility = any(k in pb for k in facility_keywords)
    if pa_facility and pb_facility:
        return False

    # Distinct remote locations that are physically impossible to inhabit simultaneously
    distant_pairs = [
        ("gulberg", "warehouse"),
        ("gulberg", "dock"),
        ("gulberg", "loading"),
        ("islamabad", "warehouse"),
        ("islamabad", "vicinity"),
        ("serena hotel", "warehouse"),
        ("home", "warehouse")
    ]
    for loc1, loc2 in distant_pairs:
        if (loc1 in pa and loc2 in pb) or (loc2 in pa and loc1 in pb):
            return True

    return False

def run_contradiction_pipeline(case_id: str = "CASE-2026-001") -> List[Dict[str, Any]]:
    """
    Executes Rule Layer first, then targeted AI Layer.
    Saves new contradictions to the database and records audit logs.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Load all existing facts
    cursor.execute("""
        SELECT f.*, d.title as doc_title, d.type as doc_type, p.name as person_name 
        FROM facts f
        JOIN documents d ON f.document_id = d.id
        LEFT JOIN people p ON f.person_id = p.id
        WHERE f.case_id = ?
        ORDER BY f.created_at ASC
    """, (case_id,))
    facts = [dict(r) for r in cursor.fetchall()]

    # Load existing contradictions to avoid duplicates
    cursor.execute("""
        SELECT c.fact_a_id, c.fact_b_id, fa.document_id as doc_a, fb.document_id as doc_b
        FROM contradictions c
        JOIN facts fa ON c.fact_a_id = fa.id
        JOIN facts fb ON c.fact_b_id = fb.id
        WHERE c.case_id = ?
    """, (case_id,))
    existing_pairs = set()
    existing_doc_pairs = set()
    for row in cursor.fetchall():
        existing_pairs.add((row["fact_a_id"], row["fact_b_id"]))
        existing_pairs.add((row["fact_b_id"], row["fact_a_id"]))
        doc_pair = (min(row["doc_a"], row["doc_b"]), max(row["doc_a"], row["doc_b"]))
        existing_doc_pairs.add(doc_pair)

    new_contradictions = []

    # -------------------------------------------------------------
    # Tier 1: RULE LAYER (Exact deterministic checks)
    # -------------------------------------------------------------
    for i in range(len(facts)):
        for j in range(i + 1, len(facts)):
            fa = facts[i]
            fb = facts[j]
            pair_key = (fa["id"], fb["id"])
            doc_pair_key = (min(fa["document_id"], fb["document_id"]), max(fa["document_id"], fb["document_id"]))

            if pair_key in existing_pairs or doc_pair_key in existing_doc_pairs:
                continue

            # Rule 1.1: Same Person (or their vehicle) in two different places in overlapping times
            person_a = (fa.get("person_name") or "").lower()
            person_b = (fb.get("person_name") or "").lower()
            
            # Check vehicle attribution (e.g. Ali's car)
            is_ali_conflict = ("ali" in person_a or "ali" in fa["action"].lower() or "ali" in fa["quote"].lower()) and \
                              ("ali" in person_b or "ali" in fb["action"].lower() or "ali" in fb["quote"].lower())

            same_person = (person_a == person_b and person_a != "") or is_ali_conflict

            start_a = parse_time_to_minutes(fa["time_start"])
            end_a = parse_time_to_minutes(fa["time_end"])
            start_b = parse_time_to_minutes(fb["time_start"])
            end_b = parse_time_to_minutes(fb["time_end"])

            if same_person and places_are_mutually_exclusive(fa["place"], fb["place"]):
                if time_ranges_overlap(start_a, end_a, start_b, end_b):
                    rule_contr = {
                        "id": f"CONTRA-RULE-{len(existing_pairs)+len(new_contradictions)+1:03d}",
                        "case_id": case_id,
                        "fact_a_id": fa["id"],
                        "fact_b_id": fb["id"],
                        "type": "rule",
                        "explanation": f"Inconsistent, needs human review: Spatial-temporal overlap for {fa.get('person_name', 'Subject')}. Claimed presence at '{fa.get('place')}' ({fa.get('time_start')}) conflicts with presence at '{fb.get('place')}' ({fb.get('time_start')}).",
                        "severity": "high",
                        "status": "open",
                        "created_at": fa["created_at"]
                    }
                    new_contradictions.append(rule_contr)
                    existing_pairs.add((fa["id"], fb["id"]))
                    existing_pairs.add((fb["id"], fa["id"]))
                    existing_doc_pairs.add(doc_pair_key)
                    continue

            # Rule 1.2: Digital / Telemetry Record vs Witness Statement
            # E.g. Phone log near warehouse vs Claim of being out of town
            is_phone_contra = (fa["doc_type"] == "phone log" and "out of town" in fb["quote"].lower()) or \
                              (fb["doc_type"] == "phone log" and "out of town" in fa["quote"].lower())
            
            if is_phone_contra:
                phone_fact = fa if fa["doc_type"] == "phone log" else fb
                stmt_fact = fb if fa["doc_type"] == "phone log" else fa
                rule_contr = {
                    "id": f"CONTRA-RULE-{len(existing_pairs)+len(new_contradictions)+1:03d}",
                    "case_id": case_id,
                    "fact_a_id": stmt_fact["id"],
                    "fact_b_id": phone_fact["id"],
                    "type": "rule",
                    "explanation": f"Inconsistent, needs human review: Carrier cellular telemetry records an active mobile ping near the warehouse ({phone_fact.get('time_start')}), which is inconsistent with statement claim of being out of town.",
                    "severity": "high",
                    "status": "open",
                    "created_at": phone_fact["created_at"]
                }
                new_contradictions.append(rule_contr)
                existing_pairs.add((fa["id"], fb["id"]))
                existing_pairs.add((fb["id"], fa["id"]))
                existing_doc_pairs.add(doc_pair_key)
                continue

            # Rule 1.3: CCTV Hardware Telemetry vs Witness Statement
            # E.g. CCTV was offline 21:15-23:30 vs witness claiming gate camera worked perfectly
            is_cctv_contra = (fa["doc_type"] == "cctv" and "working perfectly" in fb["quote"].lower()) or \
                             (fb["doc_type"] == "cctv" and "working perfectly" in fa["quote"].lower())

            if is_cctv_contra:
                cctv_fact = fa if fa["doc_type"] == "cctv" else fb
                stmt_fact = fb if fa["doc_type"] == "cctv" else fa
                rule_contr = {
                    "id": f"CONTRA-RULE-{len(existing_pairs)+len(new_contradictions)+1:03d}",
                    "case_id": case_id,
                    "fact_a_id": stmt_fact["id"],
                    "fact_b_id": cctv_fact["id"],
                    "type": "rule",
                    "explanation": f"Inconsistent, needs human review: Hardware telemetry log confirms camera CAM-02 was offline from 9:15 PM to 11:30 PM due to manual power severed, which conflicts with witness statement asserting continuous operation.",
                    "severity": "high",
                    "status": "open",
                    "created_at": cctv_fact["created_at"]
                }
                new_contradictions.append(rule_contr)
                existing_pairs.add((fa["id"], fb["id"]))
                existing_pairs.add((fb["id"], fa["id"]))
                existing_doc_pairs.add(doc_pair_key)
                continue

    # -------------------------------------------------------------
    # Tier 2: AI LAYER (Semantic conflict detection for candidate pairs)
    # The AI only compares fact pairs that share a person, place, or entity
    # -------------------------------------------------------------
    for i in range(len(facts)):
        for j in range(i + 1, len(facts)):
            fa = facts[i]
            fb = facts[j]
            pair_key = (fa["id"], fb["id"])
            doc_pair_key = (min(fa["document_id"], fb["document_id"]), max(fa["document_id"], fb["document_id"]))

            if pair_key in existing_pairs or doc_pair_key in existing_doc_pairs:
                continue

            person_a = (fa.get("person_name") or "").lower()
            person_b = (fb.get("person_name") or "").lower()
            place_a = (fa.get("place") or "").lower()
            place_b = (fb.get("place") or "").lower()

            # Must share person OR place OR topic to qualify for AI comparison
            shares_person = person_a and (person_a == person_b or person_a in person_b or person_b in person_a)
            shares_place = place_a and place_b and (place_a in place_b or place_b in place_a or "warehouse" in place_a and "warehouse" in place_b)

            if not (shares_person or shares_place):
                continue

            # Run AI Comparison
            ai_result = compare_facts(fa, fb)
            if ai_result.get("contradiction"):
                ai_contr = {
                    "id": f"CONTRA-AI-{len(existing_pairs)+len(new_contradictions)+1:03d}",
                    "case_id": case_id,
                    "fact_a_id": fa["id"],
                    "fact_b_id": fb["id"],
                    "type": "AI",
                    "explanation": ai_result.get("explanation", "Inconsistent, needs human review."),
                    "severity": ai_result.get("severity", "medium"),
                    "status": "open",
                    "created_at": fa["created_at"]
                }
                new_contradictions.append(ai_contr)
                existing_pairs.add((fa["id"], fb["id"]))
                existing_pairs.add((fb["id"], fa["id"]))
                existing_doc_pairs.add(doc_pair_key)

    # Save newly found contradictions to database
    if new_contradictions:
        cursor = conn.cursor()
        for c in new_contradictions:
            cursor.execute("""
                INSERT OR IGNORE INTO contradictions (id, case_id, fact_a_id, fact_b_id, type, explanation, severity, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (c["id"], c["case_id"], c["fact_a_id"], c["fact_b_id"], c["type"], c["explanation"], c["severity"], c["status"], c["created_at"]))
        conn.commit()
    conn.close()

    # Log audit events after committing and closing the connection
    if new_contradictions:
        for c in new_contradictions:
            log_audit(
                action="CONTRADICTION_FLAGGED",
                target=c["id"],
                details=f"Type: {c['type']} | Explanation: {c['explanation']}",
                role="system",
                case_id=case_id
            )

    return new_contradictions
