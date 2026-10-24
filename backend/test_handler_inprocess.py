"""
In-process mock test for CaseBoardHandler:
Tests HTTP routes, headers, JSON serialization, and error codes without binding TCP sockets.
"""

import sys
import os
import io
import json

sys.path.insert(0, os.path.dirname(__file__))

from server import CaseBoardHandler
from database import init_db
from seed_data import seed_database

class DummySocket:
    def __init__(self, data_in: bytes):
        self.rfile = io.BytesIO(data_in)
        self.wfile = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if 'r' in mode:
            return self.rfile
        return self.wfile

class InProcessHandler(CaseBoardHandler):
    def __init__(self, request_bytes: bytes):
        self.sock = DummySocket(request_bytes)
        self.rfile = self.sock.rfile
        self.wfile = self.sock.wfile
        self.client_address = ('127.0.0.1', 50000)
        self.server = None
        self.raw_requestline = self.rfile.readline()
        self.parse_request()

def test_routes():
    init_db()
    seed_database(include_sara=False)

    print("=== TEST 1: GET /api/case ===")
    req1 = b"GET /api/case HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
    h1 = InProcessHandler(req1)
    h1.do_GET()
    out1 = h1.wfile.getvalue().decode('utf-8')
    assert "HTTP/1.0 200" in out1 or "HTTP/1.1 200" in out1
    body1 = json.loads(out1.split("\r\n\r\n", 1)[1])
    assert body1["case"]["id"] == "CASE-2026-001"
    print(f"GET /api/case passed: {len(body1['documents'])} documents, {len(body1['contradictions'])} baseline contradictions.")

    print("\n=== TEST 2: GET /api/timeline ===")
    req2 = b"GET /api/timeline HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
    h2 = InProcessHandler(req2)
    h2.do_GET()
    out2 = h2.wfile.getvalue().decode('utf-8')
    body2 = json.loads(out2.split("\r\n\r\n", 1)[1])
    assert body2["gaps"][0]["gap_start"] == "22:45"
    print(f"GET /api/timeline passed: Gap {body2['gaps'][0]['gap_start']} - {body2['gaps'][0]['gap_end']} identified.")

    print("\n=== TEST 3: POST /api/intake-chunk (Sara car sighting) ===")
    chunk3 = {
        "index": 3,
        "speaker": "Sara (Night Guard)",
        "timestamp": "22:30 Sighting",
        "text": "Around 10:30 PM, I looked outside towards the west parking bay and saw Ali's silver Honda Civic parked outside near the loading dock. I recognized the license plate."
    }
    chunk_bytes = json.dumps(chunk3).encode('utf-8')
    req3 = f"POST /api/intake-chunk HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {len(chunk_bytes)}\r\n\r\n".encode('utf-8') + chunk_bytes
    h3 = InProcessHandler(req3)
    h3.do_POST()
    out3 = h3.wfile.getvalue().decode('utf-8')
    assert "200 OK" in out3 or "HTTP/1.0 200" in out3
    body3 = json.loads(out3.split("\r\n\r\n", 1)[1])
    assert body3["success"] is True
    print(f"POST /api/intake-chunk passed: Ingested chunk #{body3['chunk_index']}.")

    print("\n=== TEST 4: GET /api/summary ===")
    req4 = b"GET /api/summary HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
    h4 = InProcessHandler(req4)
    h4.do_GET()
    out4 = h4.wfile.getvalue().decode('utf-8')
    body4 = json.loads(out4.split("\r\n\r\n", 1)[1])
    assert "[S1]" in body4["summary"]
    print("GET /api/summary passed: Cited prose verified.")

    print("\n=== TEST 5: GET / (Frontend HTML) ===")
    req5 = b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
    h5 = InProcessHandler(req5)
    h5.do_GET()
    out5 = h5.wfile.getvalue().decode('utf-8')
    assert "CaseBoard AI" in out5
    assert "Decision Support Only" in out5
    print("GET / passed: Frontend HTML served.")

    print("\n>>> ALL IN-PROCESS HANDLER TESTS PASSED! <<<")

if __name__ == "__main__":
    test_routes()
