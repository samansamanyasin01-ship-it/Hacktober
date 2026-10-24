"""
CaseBoard AI - Backend Server
Provides REST APIs, SSE real-time streaming, and static file serving using standard library HTTP.
"""

import os
import json
import time
import mimetypes
import threading
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, SimpleHTTPRequestHandler
from database import get_connection, log_audit, init_db, get_setting, set_setting
from seed_data import seed_database, CASE_INFO, SARA_STATEMENT, SARA_LIVE_CHUNKS, URDU_SAMPLE_STATEMENT, ingest_document, refresh_leads
from contradiction_engine import run_contradiction_pipeline
from ai_service import get_ai_config, summarize_case, suggest_leads

# Global client queue for Server-Sent Events (SSE)
_sse_clients = []
_sse_lock = threading.Lock()

def broadcast_event(event_type: str, data: dict):
    """Broadcast an SSE event to all connected browser clients."""
    with _sse_lock:
        dead_clients = []
        payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n".encode("utf-8")
        for client in _sse_clients:
            try:
                client.wfile.write(payload)
                client.wfile.flush()
            except Exception:
                dead_clients.append(client)
        for dead in dead_clients:
            if dead in _sse_clients:
                _sse_clients.remove(dead)

class CaseBoardHandler(SimpleHTTPRequestHandler):
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

    def send_json(self, status_code: int, data: any):
        """Helper to send a JSON response with CORS headers."""
        response_body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def do_OPTIONS(self):
        """CORS pre-flight request handler."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # ---------------------------------------------------------
        # SSE Streaming Endpoint
        # ---------------------------------------------------------
        if path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            # Send initial keepalive
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()

            with _sse_lock:
                _sse_clients.append(self)

            # Keep connection open until client disconnects
            try:
                while True:
                    time.sleep(15)
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                with _sse_lock:
                    if self in _sse_clients:
                        _sse_clients.remove(self)
            return

        # ---------------------------------------------------------
        # REST API Routes
        # ---------------------------------------------------------
        if path == "/api/case":
            self.handle_get_case()
            return
        elif path == "/api/timeline":
            self.handle_get_timeline()
            return
        elif path == "/api/leads":
            self.handle_get_leads()
            return
        elif path == "/api/summary":
            self.handle_get_summary()
            return
        elif path == "/api/audit-logs":
            self.handle_get_audit_logs(query)
            return
        elif path == "/api/settings":
            self.handle_get_settings()
            return
        elif path == "/api/live-chunks":
            self.send_json(200, {
                "chunks": SARA_LIVE_CHUNKS,
                "statement": SARA_STATEMENT,
                "urdu_sample": URDU_SAMPLE_STATEMENT
            })
            return

        # ---------------------------------------------------------
        # Static Frontend File Serving
        # ---------------------------------------------------------
        if path == "/" or path == "":
            file_path = os.path.join(self.frontend_dir, "index.html")
        else:
            rel_path = path.lstrip("/")
            file_path = os.path.join(self.frontend_dir, rel_path)

        if os.path.exists(file_path) and os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            self.send_response(200)
            self.send_header("Content-Type", mime_type or "application/octet-stream")
            self.send_header("Cache-Control", "no-cache")
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            # Fallback to index.html for SPA
            index_path = os.path.join(self.frontend_dir, "index.html")
            if os.path.exists(index_path):
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                with open(index_path, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"File not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Read JSON body
        content_len = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            body = json.loads(post_data)
        except json.JSONDecodeError:
            body = {}

        if path == "/api/documents":
            self.handle_post_document(body)
        elif path == "/api/intake-chunk":
            self.handle_post_intake_chunk(body)
        elif path.startswith("/api/contradictions/") and path.endswith("/review"):
            contra_id = path.split("/")[3]
            self.handle_post_review_contradiction(contra_id, body)
        elif path == "/api/leads/generate":
            self.handle_post_generate_leads()
        elif path == "/api/summary/generate":
            self.handle_post_generate_summary()
        elif path == "/api/settings":
            self.handle_post_settings(body)
        elif path == "/api/reset-demo":
            self.handle_post_reset_demo(body)
        else:
            self.send_json(404, {"error": f"Endpoint not found: {path}"})

    # -------------------------------------------------------------
    # Route Handlers
    # -------------------------------------------------------------
    def handle_get_case(self):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM cases WHERE id = ?", (CASE_INFO["id"],))
        case_row = cursor.fetchone()
        case_data = dict(case_row) if case_row else CASE_INFO

        cursor.execute("SELECT * FROM people WHERE case_id = ? ORDER BY id ASC", (CASE_INFO["id"],))
        people = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT d.*, p.name as person_name FROM documents d LEFT JOIN people p ON d.person_id = p.id WHERE d.case_id = ? ORDER BY d.added_at ASC", (CASE_INFO["id"],))
        documents = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT f.*, d.title as doc_title, d.type as doc_type, p.name as person_name 
            FROM facts f 
            JOIN documents d ON f.document_id = d.id 
            LEFT JOIN people p ON f.person_id = p.id 
            WHERE f.case_id = ? 
            ORDER BY f.time_start ASC, f.created_at ASC
        """, (CASE_INFO["id"],))
        facts = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT c.*, 
                   fa.quote as quote_a, fa.action as action_a, fa.place as place_a, fa.time_start as time_a, da.title as doc_title_a, pa.name as person_name_a,
                   fb.quote as quote_b, fb.action as action_b, fb.place as place_b, fb.time_start as time_b, db.title as doc_title_b, pb.name as person_name_b
            FROM contradictions c
            JOIN facts fa ON c.fact_a_id = fa.id
            JOIN facts fb ON c.fact_b_id = fb.id
            JOIN documents da ON fa.document_id = da.id
            JOIN documents db ON fb.document_id = db.id
            LEFT JOIN people pa ON fa.person_id = pa.id
            LEFT JOIN people pb ON fb.person_id = pb.id
            WHERE c.case_id = ?
            ORDER BY c.created_at DESC
        """, (CASE_INFO["id"],))
        contradictions = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM leads WHERE case_id = ? ORDER BY created_at DESC", (CASE_INFO["id"],))
        leads = [dict(r) for r in cursor.fetchall()]

        conn.close()

        open_contra = sum(1 for c in contradictions if c["status"] == "open")
        reviewed_contra = sum(1 for c in contradictions if c["status"] == "reviewed")

        self.send_json(200, {
            "case": case_data,
            "people": people,
            "documents": documents,
            "facts": facts,
            "contradictions": contradictions,
            "leads": leads,
            "stats": {
                "total_documents": len(documents),
                "total_facts": len(facts),
                "total_contradictions": len(contradictions),
                "open_contradictions": open_contra,
                "reviewed_contradictions": reviewed_contra,
                "forensic_window": f"{case_data.get('forensic_window_start')} - {case_data.get('forensic_window_end')}"
            }
        })

    def handle_get_timeline(self):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT f.*, d.title as doc_title, d.type as doc_type, p.name as person_name, p.display_alias
            FROM facts f
            JOIN documents d ON f.document_id = d.id
            LEFT JOIN people p ON f.person_id = p.id
            WHERE f.case_id = ? AND f.time_start IS NOT NULL
            ORDER BY f.time_start ASC
        """, (CASE_INFO["id"],))
        timed_facts = [dict(r) for r in cursor.fetchall()]

        # Identify Gaps (spec specifically asks to highlight the 10:45 to 11:15 gap)
        gaps = [
            {
                "gap_start": "22:45",
                "gap_end": "23:15",
                "duration_minutes": 30,
                "label": "CRITICAL FORENSIC BLACKOUT GAP",
                "description": "Zero witness accounts, physical observations, or digital records exist between 10:45 PM and 11:15 PM. This critical 30-minute interval overlaps with the conclusion of the forensic time-of-death window and South Gate camera outage.",
                "severity": "critical"
            }
        ]

        conn.close()
        self.send_json(200, {
            "events": timed_facts,
            "gaps": gaps,
            "forensic_window": {"start": "21:30", "end": "23:00"}
        })

    def handle_get_leads(self):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM leads WHERE case_id = ? ORDER BY created_at DESC", (CASE_INFO["id"],))
        leads = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json(200, {"leads": leads})

    def handle_get_summary(self):
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM facts WHERE case_id = ?", (CASE_INFO["id"],))
        facts = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM contradictions WHERE case_id = ?", (CASE_INFO["id"],))
        contradictions = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM documents WHERE case_id = ?", (CASE_INFO["id"],))
        documents = [dict(r) for r in cursor.fetchall()]

        conn.close()

        summary_text = summarize_case(facts, contradictions, documents)
        self.send_json(200, {"summary": summary_text})

    def handle_get_audit_logs(self, query: dict):
        user_filter = query.get("user", [None])[0]
        action_filter = query.get("action", [None])[0]

        conn = get_connection()
        cursor = conn.cursor()
        sql = "SELECT * FROM audit_logs WHERE 1=1"
        params = []
        if user_filter:
            sql += " AND user = ?"
            params.append(user_filter)
        if action_filter:
            sql += " AND action = ?"
            params.append(action_filter)
        sql += " ORDER BY id DESC LIMIT 100"

        cursor.execute(sql, params)
        logs = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json(200, {"audit_logs": logs})

    def handle_get_settings(self):
        cfg = get_ai_config()
        # Mask API key for security
        masked_key = (cfg["api_key"][:4] + "..." + cfg["api_key"][-4:]) if len(cfg["api_key"]) > 8 else ("Configured" if cfg["api_key"] else "None (Using DO Fallback Engine)")
        self.send_json(200, {
            "provider": cfg["provider"],
            "base_url": cfg["base_url"],
            "model": cfg["model"],
            "api_key_status": masked_key,
            "has_api_key": bool(cfg["api_key"])
        })

    def handle_post_document(self, body: dict):
        person_id = body.get("person_id")
        doc_type = body.get("type", "statement")
        title = body.get("title", "Submitted Statement")
        text = body.get("text", "").strip()
        added_by = body.get("added_by", "Investigator Miller")

        if not text:
            self.send_json(400, {"error": "Statement text is required."})
            return

        doc_id = f"DOC-{int(time.time()*1000)%100000:05d}"
        added_at = time.strftime("%Y-%m-%dT%H:%M:%S")

        ingest_document(doc_id, person_id, doc_type, title, text, added_by, added_at)
        new_contras = run_contradiction_pipeline(CASE_INFO["id"])
        refresh_leads()

        # Broadcast SSE
        broadcast_event("document_added", {
            "document_id": doc_id,
            "title": title,
            "new_contradictions_count": len(new_contras)
        })

        if new_contras:
            for c in new_contras:
                broadcast_event("contradiction_found", c)

        self.send_json(201, {
            "success": True,
            "document_id": doc_id,
            "new_contradictions": new_contras
        })

    def handle_post_intake_chunk(self, body: dict):
        """
        Receives one live transcript chunk during live interview demo.
        Simulates line-by-line real-time entry and triggers contradiction alerts.
        """
        chunk_idx = body.get("index", 1)
        chunk_text = body.get("text", "")
        speaker = body.get("speaker", "Sara (Night Guard)")
        
        log_audit(
            action="LIVE_INTERVIEW_CHUNK",
            target=f"Transcript Chunk #{chunk_idx}",
            details=f"Received live spoken statement: \"{chunk_text}\"",
            user="Court Reporter / Stenographer",
            role="investigator"
        )

        # Check if Sara's document already exists in DB
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, text FROM documents WHERE id = 'DOC-08'")
        existing_doc = cursor.fetchone()

        if not existing_doc:
            # First chunk: create Sara's statement
            cursor.execute("""
                INSERT INTO documents (id, case_id, person_id, type, title, text, added_by, added_at)
                VALUES ('DOC-08', ?, 'P-03', 'statement', 'Sara Statement #1 (Night Guard Interview)', ?, 'Det. J. Miller (Live Stream)', ?)
            """, (CASE_INFO["id"], chunk_text, time.strftime("%Y-%m-%dT%H:%M:%S")))
            accumulated_text = chunk_text
        else:
            accumulated_text = existing_doc["text"] + " " + chunk_text
            cursor.execute("UPDATE documents SET text = ? WHERE id = 'DOC-08'", (accumulated_text,))
        
        conn.commit()
        conn.close()

        # Extract facts for this chunk
        from ai_service import extract_facts
        extracted = extract_facts(accumulated_text, "Sara", "DOC-08")
        
        conn = get_connection()
        cursor = conn.cursor()
        # Clear previous temporary facts for DOC-08
        cursor.execute("DELETE FROM facts WHERE document_id = 'DOC-08'")
        for idx, f in enumerate(extracted, 1):
            fact_id = f"FACT-DOC-08-{idx:02d}"
            cursor.execute("""
                INSERT INTO facts (id, case_id, person_id, document_id, action, place, time_start, time_end, quote, confidence, created_at)
                VALUES (?, ?, 'P-03', 'DOC-08', ?, ?, ?, ?, ?, ?, ?)
            """, (fact_id, CASE_INFO["id"], f["action"], f["place"], f["time_start"], f["time_end"], f["quote"], 1.0, time.strftime("%Y-%m-%dT%H:%M:%S")))
        conn.commit()
        conn.close()

        # Run contradiction engine
        new_contras = run_contradiction_pipeline(CASE_INFO["id"])
        refresh_leads()

        # Broadcast SSE
        broadcast_event("live_chunk_processed", {
            "chunk_index": chunk_idx,
            "text": chunk_text,
            "speaker": speaker,
            "contradictions": new_contras
        })

        if new_contras:
            for c in new_contras:
                broadcast_event("contradiction_found", c)

        self.send_json(200, {
            "success": True,
            "chunk_index": chunk_idx,
            "new_contradictions": new_contras,
            "facts_count": len(extracted)
        })

    def handle_post_review_contradiction(self, contra_id: str, body: dict):
        status = body.get("status", "reviewed") # 'reviewed' or 'dismissed'
        notes = body.get("notes", "")
        reviewer = body.get("reviewed_by", "Supervisor Reynolds")

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE contradictions
            SET status = ?, supervisor_notes = ?, reviewed_by = ?, reviewed_at = ?
            WHERE id = ?
        """, (status, notes, reviewer, time.strftime("%Y-%m-%dT%H:%M:%S"), contra_id))
        conn.commit()
        conn.close()

        log_audit(
            action="CONTRADICTION_REVIEWED",
            target=contra_id,
            details=f"Supervisor marked flag as '{status}'. Notes: {notes}",
            user=reviewer,
            role="supervisor"
        )

        broadcast_event("contradiction_updated", {
            "id": contra_id,
            "status": status,
            "notes": notes,
            "reviewed_by": reviewer
        })

        self.send_json(200, {"success": True, "id": contra_id, "status": status})

    def handle_post_generate_leads(self):
        refresh_leads()
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM leads WHERE case_id = ? ORDER BY created_at DESC", (CASE_INFO["id"],))
        leads = [dict(r) for r in cursor.fetchall()]
        conn.close()

        broadcast_event("leads_updated", {"leads": leads})
        self.send_json(200, {"success": True, "leads": leads})

    def handle_post_generate_summary(self):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM facts WHERE case_id = ?", (CASE_INFO["id"],))
        facts = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM contradictions WHERE case_id = ?", (CASE_INFO["id"],))
        contradictions = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM documents WHERE case_id = ?", (CASE_INFO["id"],))
        documents = [dict(r) for r in cursor.fetchall()]
        conn.close()

        summary_text = summarize_case(facts, contradictions, documents)
        self.send_json(200, {"summary": summary_text})

    def handle_post_settings(self, body: dict):
        if "provider" in body:
            set_setting("ai_provider", body["provider"])
        if "base_url" in body:
            set_setting("ai_base_url", body["base_url"])
        if "api_key" in body and body["api_key"] != "******":
            set_setting("ai_api_key", body["api_key"])
        if "model" in body:
            set_setting("ai_model", body["model"])

        log_audit(
            action="AI_SETTINGS_UPDATED",
            target="System Configuration",
            details=f"Provider: {body.get('provider')} | Model: {body.get('model')}",
            user="Supervisor Reynolds",
            role="supervisor"
        )
        self.send_json(200, {"success": True, "message": "Settings updated successfully."})

    def handle_post_reset_demo(self, body: dict):
        mode = body.get("mode", "ready_for_interview") # 'ready_for_interview' (Sara not yet in) or 'full'
        include_sara = (mode == "full")
        seed_database(include_sara=include_sara)
        
        broadcast_event("case_reset", {"mode": mode})
        self.send_json(200, {
            "success": True,
            "mode": mode,
            "message": f"Case reset to {mode} state."
        })

def run_server(port: int = 8080):
    init_db()
    # Initialize with Sara not yet entered, so "Play Live Interview" can be demonstrated cleanly!
    seed_database(include_sara=False)
    server_address = ("", port)
    httpd = HTTPServer(server_address, CaseBoardHandler)
    print(f"CaseBoard AI running at http://127.0.0.1:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(port)
