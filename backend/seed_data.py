"""
Seed data for CaseBoard AI: "The Riverside Warehouse Murder" (Fictional Case).
Contains all people, initial documents, forensic baseline, and transcript chunks for live playback.
"""

from datetime import datetime
from database import get_connection, log_audit, init_db
from ai_service import extract_facts, suggest_leads
from contradiction_engine import run_contradiction_pipeline

CASE_INFO = {
    "id": "CASE-2026-001",
    "title": "The Riverside Warehouse Murder",
    "status": "active",
    "description": "Homicide investigation of warehouse manager Daniyal Rauf found deceased at Riverside Warehouse Dock 3. Time of death estimated between 21:30 and 23:00.",
    "forensic_window_start": "21:30",
    "forensic_window_end": "23:00",
    "created_at": "2026-10-24T06:40:00"
}

PEOPLE = [
    {
        "id": "P-01",
        "name": "Daniyal Rauf",
        "role": "victim",
        "display_alias": "D. R. (Victim)",
        "notes": "Warehouse general manager for 6 years. Found deceased at 06:40 AM by morning cleaning crew."
    },
    {
        "id": "P-02",
        "name": "Ali",
        "role": "suspect",
        "display_alias": "Ali (Warehouse Employee)",
        "notes": "Inventory clerk and warehouse supervisor. Had access to master keys and electrical control room."
    },
    {
        "id": "P-03",
        "name": "Sara",
        "role": "witness",
        "display_alias": "Sara (Night Security Guard)",
        "notes": "Private security officer on duty from 20:00 PM to 06:00 AM at South Gate checkpoint."
    },
    {
        "id": "P-04",
        "name": "Hamza",
        "role": "suspect",
        "display_alias": "Hamza (Business Partner)",
        "notes": "Co-owner and primary financial backer of Riverside Logistics. Had severe dispute over audit discrepancies."
    },
    {
        "id": "P-05",
        "name": "Nadia",
        "role": "witness",
        "display_alias": "Nadia (Residential Neighbor)",
        "notes": "Resident residing at 42 River Road directly facing the main warehouse entrance."
    }
]

# Baseline documents pre-loaded prior to Sara's live interview
BASELINE_DOCUMENTS = [
    {
        "id": "DOC-01",
        "person_id": "P-01",
        "type": "forensic",
        "title": "Forensic Pathology Initial Post-Mortem Report",
        "added_by": "Dr. E. Vance (Chief Medical Examiner)",
        "added_at": "2026-10-24T07:15:00",
        "text": "Victim Daniyal Rauf found deceased at 6:40 AM. Rigor mortis and liver core temperature analysis establish the estimated time of death between 9:30 PM and 11:00 PM. Cause of death is blunt force trauma to the occipital region."
    },
    {
        "id": "DOC-02",
        "person_id": "P-02",
        "type": "statement",
        "title": "Ali Statement #1 (Recorded Interview)",
        "added_by": "Det. J. Miller",
        "added_at": "2026-10-24T07:45:00",
        "text": "I worked normal shift until 9:00 PM yesterday. I closed my desk and left at 9:00 PM sharp. I drove directly back to my apartment in Gulberg and stayed home all night sleeping. I never returned to the warehouse."
    },
    {
        "id": "DOC-03",
        "person_id": "P-04",
        "type": "statement",
        "title": "Hamza Statement #1 (Written Deposition)",
        "added_by": "Det. S. Chen",
        "added_at": "2026-10-24T08:20:00",
        "text": "I had no reason to be anywhere near the warehouse yesterday. I was completely out of town all day in Islamabad for vendor meetings. I checked into the Serena Hotel at 2:00 PM and did not return to the city until morning."
    },
    {
        "id": "DOC-04",
        "person_id": "P-04",
        "type": "phone log",
        "title": "Cell Tower Telemetry: Hamza Mobile (Tower WH-04)",
        "added_by": "Cyber Forensics Bureau",
        "added_at": "2026-10-24T08:50:00",
        "text": "Automated Carrier Log: MSISDN 92-300-8841209 (registered to Hamza Tariq) registered voice call and data packet transmission through Tower WH-04 Sector B, located 180 meters from Riverside Warehouse, at 9:45 PM on October 23."
    },
    {
        "id": "DOC-05",
        "person_id": None,
        "type": "cctv",
        "title": "CCTV Hardware Telemetry - South Gate CAM-02",
        "added_by": "Physical Security Forensics",
        "added_at": "2026-10-24T09:10:00",
        "text": "Hardware Log: CAM-02 South Gate experienced power failure and network packet drop. Video stream offline from 9:15 PM to 11:30 PM. Manual switch was flipped in electrical room."
    },
    {
        "id": "DOC-06",
        "person_id": "P-05",
        "type": "statement",
        "title": "Nadia Statement #1 (Initial Canvass)",
        "added_by": "Officer R. Gomez",
        "added_at": "2026-10-24T09:30:00",
        "text": "I live directly across the street from the warehouse entrance. I was watching television in my front room from 9:00 PM to 11:30 PM with the windows open. The street was completely quiet and I heard nothing unusual the whole evening."
    },
    {
        "id": "DOC-07",
        "person_id": "P-05",
        "type": "statement",
        "title": "Nadia Statement #2 (Amended Witness Statement)",
        "added_by": "Det. J. Miller",
        "added_at": "2026-10-24T10:00:00",
        "text": "Upon further reflection, I need to amend my statement. When I stepped onto my porch for fresh air, I distinctly heard a loud argument with shouting coming from inside the warehouse around 10:00 PM. Two voices were arguing angrily."
    }
]

# Sara's Statement #1 (used for "Play Live Interview" demo or full load)
SARA_STATEMENT = {
    "id": "DOC-08",
    "person_id": "P-03",
    "type": "statement",
    "title": "Sara Statement #1 (Night Guard Interview)",
    "added_by": "Det. J. Miller",
    "added_at": "2026-10-24T10:15:00",
    "text": "I was stationed at the south gate starting 8:00 PM. The gate camera was working perfectly throughout my entire shift. Around 10:30 PM, I looked outside towards the west parking bay and saw Ali's silver Honda Civic parked outside near the loading dock. I recognized the license plate."
}

# Line-by-line chunks for "Play Live Interview" streaming simulation
SARA_LIVE_CHUNKS = [
    {
        "index": 1,
        "speaker": "Sara (Night Guard)",
        "timestamp": "20:00 Shift Start",
        "text": "I was stationed at the south gate starting 8:00 PM."
    },
    {
        "index": 2,
        "speaker": "Sara (Night Guard)",
        "timestamp": "Gate Surveillance",
        "text": "The gate camera was working perfectly throughout my entire shift."
    },
    {
        "index": 3,
        "speaker": "Sara (Night Guard)",
        "timestamp": "22:30 Sighting",
        "text": "Around 10:30 PM, I looked outside towards the west parking bay and saw Ali's silver Honda Civic parked outside near the loading dock. I recognized the license plate."
    }
]

# Urdu sample statement for Urdu input demonstration
URDU_SAMPLE_STATEMENT = {
    "speaker": "Tariq (Urdu Witness)",
    "urdu_text": "میں نے رات تقریباً ساڑھے دس بجے گودام کے پچھلے گیٹ پر ایک گاڑی کو تیز رفتاری سے نکلتے دیکھا تھا۔ گودام کے اندر تمام بتیاں بند تھیں۔",
    "english_translation": "Around 10:30 PM, I saw a car speeding away from the rear gate of the warehouse. All the lights inside the warehouse were turned off.",
    "quote": "میں نے رات تقریباً ساڑھے دس بجے گودام کے پچھلے گیٹ پر ایک گاڑی کو تیز رفتاری سے نکلتے دیکھا تھا"
}

def seed_database(include_sara: bool = True):
    """Initializes the database with people, documents, facts, and contradictions."""
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Clear previous case data
    cursor.execute("DELETE FROM audit_logs")
    cursor.execute("DELETE FROM leads")
    cursor.execute("DELETE FROM contradictions")
    cursor.execute("DELETE FROM facts")
    cursor.execute("DELETE FROM documents")
    cursor.execute("DELETE FROM people")
    cursor.execute("DELETE FROM cases")

    # Insert Case
    cursor.execute("""
        INSERT INTO cases (id, title, status, description, forensic_window_start, forensic_window_end, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (CASE_INFO["id"], CASE_INFO["title"], CASE_INFO["status"], CASE_INFO["description"], CASE_INFO["forensic_window_start"], CASE_INFO["forensic_window_end"], CASE_INFO["created_at"]))

    # Insert People
    for p in PEOPLE:
        cursor.execute("""
            INSERT INTO people (id, case_id, name, role, display_alias, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (p["id"], CASE_INFO["id"], p["name"], p["role"], p["display_alias"], p["notes"], datetime.now().isoformat()))

    conn.commit()
    conn.close()

    # Ingest baseline documents
    docs_to_ingest = list(BASELINE_DOCUMENTS)
    if include_sara:
        docs_to_ingest.append(SARA_STATEMENT)

    for doc in docs_to_ingest:
        ingest_document(doc["id"], doc["person_id"], doc["type"], doc["title"], doc["text"], doc["added_by"], doc["added_at"])

    # Run pipeline to detect contradictions and generate leads
    run_contradiction_pipeline(CASE_INFO["id"])
    
    # Generate leads
    refresh_leads()

    log_audit(
        action="DATABASE_SEEDED",
        target="Case CASE-2026-001",
        details=f"Database seeded with {len(docs_to_ingest)} documents. (Include Sara: {include_sara})",
        role="system"
    )

def ingest_document(doc_id: str, person_id: str, doc_type: str, title: str, text: str, added_by: str, added_at: str):
    """Inserts a document, extracts structured facts, validates quotes, and saves facts."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO documents (id, case_id, person_id, type, title, text, added_by, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (doc_id, CASE_INFO["id"], person_id, doc_type, title, text, added_by, added_at))
    conn.commit()

    # Find person name
    person_name = "System"
    if person_id:
        cursor.execute("SELECT name FROM people WHERE id = ?", (person_id,))
        p_row = cursor.fetchone()
        if p_row:
            person_name = p_row["name"]

    conn.close()

    # AI Fact Extraction with verbatim validation
    extracted = extract_facts(text, person_name, doc_id)

    conn = get_connection()
    cursor = conn.cursor()
    for idx, f in enumerate(extracted, 1):
        fact_id = f"FACT-{doc_id}-{idx:02d}"
        cursor.execute("""
            INSERT INTO facts (id, case_id, person_id, document_id, action, place, time_start, time_end, quote, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (fact_id, CASE_INFO["id"], person_id, doc_id, f["action"], f["place"], f["time_start"], f["time_end"], f["quote"], f.get("confidence", 1.0), added_at))

    conn.commit()
    conn.close()

    log_audit(
        action="DOCUMENT_INGESTED",
        target=f"{title} ({doc_id})",
        details=f"Extracted {len(extracted)} structured facts with verified quotes.",
        role="investigator"
    )

def refresh_leads():
    """Generates and persists investigative leads including gap analysis."""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM facts WHERE case_id = ? ORDER BY time_start ASC", (CASE_INFO["id"],))
    facts = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM contradictions WHERE case_id = ?", (CASE_INFO["id"],))
    contradictions = [dict(r) for r in cursor.fetchall()]

    leads_data = suggest_leads(facts, contradictions)

    cursor.execute("DELETE FROM leads WHERE case_id = ?", (CASE_INFO["id"],))
    for idx, lead in enumerate(leads_data, 1):
        lead_id = f"LEAD-{idx:03d}"
        cursor.execute("""
            INSERT INTO leads (id, case_id, suggestion, reason, linked_fact_ids, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (lead_id, CASE_INFO["id"], lead["suggestion"], lead["reason"], str(lead.get("linked_fact_ids", [])), "pending", datetime.now().isoformat()))

    conn.commit()
    conn.close()
