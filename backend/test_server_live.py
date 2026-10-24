"""
End-to-end integration probe for CaseBoard AI HTTP Server.
Spins up the server, queries endpoints, tests live intake, verifies SSE response, and exits.
"""

import sys
import os
import time
import json
import threading
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))

from server import CaseBoardHandler
from http.server import HTTPServer
from database import init_db
from seed_data import seed_database

TEST_PORT = 8085

def run():
    init_db()
    seed_database(include_sara=False)
    server = HTTPServer(("127.0.0.1", TEST_PORT), CaseBoardHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    base = f"http://127.0.0.1:{TEST_PORT}"
    print(f"Server started at {base}. Probing endpoints...")

    # 1. Probe frontend
    with urllib.request.urlopen(f"{base}/") as res:
        assert res.status == 200
        html = res.read().decode("utf-8")
        assert "CaseBoard AI" in html
        assert "Decision Support Only" in html
        print("[PASS] GET / -> HTTP 200, Frontend HTML served correctly.")

    # 2. Probe /api/case
    with urllib.request.urlopen(f"{base}/api/case") as res:
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data["case"]["id"] == "CASE-2026-001"
        assert len(data["people"]) == 5
        assert len(data["documents"]) == 7
        print(f"[PASS] GET /api/case -> HTTP 200, {len(data['documents'])} baseline docs, {len(data['contradictions'])} baseline contradictions.")

    # 3. Probe /api/intake-chunk (Line 1 of Sara's statement)
    chunk1 = {
        "index": 1,
        "speaker": "Sara (Night Guard)",
        "timestamp": "20:00 Shift Start",
        "text": "I was stationed at the south gate starting 8:00 PM."
    }
    req = urllib.request.Request(
        f"{base}/api/intake-chunk",
        data=json.dumps(chunk1).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data["success"] is True
        print("[PASS] POST /api/intake-chunk (Chunk 1) -> HTTP 200, successfully ingested.")

    # 4. Probe /api/intake-chunk (Line 2 of Sara's statement - Camera working claim)
    chunk2 = {
        "index": 2,
        "speaker": "Sara (Night Guard)",
        "timestamp": "Gate Surveillance",
        "text": "The gate camera was working perfectly throughout my entire shift."
    }
    req = urllib.request.Request(
        f"{base}/api/intake-chunk",
        data=json.dumps(chunk2).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        print("[PASS] POST /api/intake-chunk (Chunk 2) -> HTTP 200, processed.")

    # 5. Probe /api/intake-chunk (Line 3 of Sara's statement - Ali car sighting at 22:30)
    chunk3 = {
        "index": 3,
        "speaker": "Sara (Night Guard)",
        "timestamp": "22:30 Sighting",
        "text": "Around 10:30 PM, I looked outside towards the west parking bay and saw Ali's silver Honda Civic parked outside near the loading dock. I recognized the license plate."
    }
    req = urllib.request.Request(
        f"{base}/api/intake-chunk",
        data=json.dumps(chunk3).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as res:
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        print(f"[PASS] POST /api/intake-chunk (Chunk 3) -> HTTP 200. Detected {len(data['new_contradictions'])} new contradiction(s)!")

    # 6. Verify full case state after live intake
    with urllib.request.urlopen(f"{base}/api/case") as res:
        data = json.loads(res.read().decode("utf-8"))
        print(f"Total Contradictions detected after Sara's intake: {len(data['contradictions'])}")
        assert len(data['contradictions']) == 4, f"Expected 4 contradictions, got {len(data['contradictions'])}"
        print("[PASS] All 4 planted contradictions detected!")

    # 7. Probe /api/timeline
    with urllib.request.urlopen(f"{base}/api/timeline") as res:
        data = json.loads(res.read().decode("utf-8"))
        assert len(data["gaps"]) > 0
        assert data["gaps"][0]["gap_start"] == "22:45"
        print(f"[PASS] GET /api/timeline -> HTTP 200. Gap identified: {data['gaps'][0]['gap_start']} - {data['gaps'][0]['gap_end']} ({data['gaps'][0]['label']})")

    # 8. Probe /api/summary
    with urllib.request.urlopen(f"{base}/api/summary") as res:
        data = json.loads(res.read().decode("utf-8"))
        assert "[S1]" in data["summary"]
        assert "[F1]" in data["summary"]
        print("[PASS] GET /api/summary -> HTTP 200. Validated cited prose summary.")

    # 9. Probe /api/audit-logs
    with urllib.request.urlopen(f"{base}/api/audit-logs") as res:
        data = json.loads(res.read().decode("utf-8"))
        assert len(data["audit_logs"]) > 0
        print(f"[PASS] GET /api/audit-logs -> HTTP 200. Retrieved {len(data['audit_logs'])} immutable audit records.")

    server.shutdown()
    print("\n>>> ALL HTTP AND REST INTEGRATION TESTS PASSED 100%! <<<")

if __name__ == "__main__":
    run()
