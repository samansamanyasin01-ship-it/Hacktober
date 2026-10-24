"""
Database management for CaseBoard AI using SQLite.
Includes thread-safe connections, schemas, migrations, and CRUD helper functions.
"""

import sqlite3
import json
import os
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.environ.get("CASEBOARD_DB_PATH", os.path.join(os.path.dirname(__file__), "caseboard.db"))
_lock = threading.Lock()

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn

def init_db():
    with _lock:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Cases table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cases (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                description TEXT,
                forensic_window_start TEXT,
                forensic_window_end TEXT,
                victim_id TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # People table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS people (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL, -- 'victim', 'witness', 'suspect'
                display_alias TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES cases(id)
            )
        """)
        
        # Documents table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                person_id TEXT,
                type TEXT NOT NULL, -- 'statement', 'forensic', 'cctv', 'phone log'
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                added_by TEXT NOT NULL,
                added_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES cases(id),
                FOREIGN KEY (person_id) REFERENCES people(id)
            )
        """)
        
        # Facts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS facts (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                person_id TEXT,
                document_id TEXT NOT NULL,
                action TEXT NOT NULL,
                place TEXT,
                time_start TEXT, -- 'HH:MM' or null
                time_end TEXT,   -- 'HH:MM' or null
                quote TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES cases(id),
                FOREIGN KEY (person_id) REFERENCES people(id),
                FOREIGN KEY (document_id) REFERENCES documents(id)
            )
        """)
        
        # Contradictions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS contradictions (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                fact_a_id TEXT NOT NULL,
                fact_b_id TEXT NOT NULL,
                type TEXT NOT NULL, -- 'rule' or 'AI'
                explanation TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
                status TEXT NOT NULL DEFAULT 'open', -- 'open', 'reviewed', 'dismissed'
                supervisor_notes TEXT,
                reviewed_by TEXT,
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES cases(id),
                FOREIGN KEY (fact_a_id) REFERENCES facts(id),
                FOREIGN KEY (fact_b_id) REFERENCES facts(id)
            )
        """)
        
        # Leads table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                reason TEXT NOT NULL,
                linked_fact_ids TEXT, -- JSON array of fact IDs
                status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'investigating', 'resolved'
                created_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES cases(id)
            )
        """)
        
        # Audit Logs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT,
                user TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'investigator', -- 'investigator', 'supervisor', 'system'
                action TEXT NOT NULL,
                target TEXT NOT NULL,
                details TEXT,
                timestamp TEXT NOT NULL
            )
        """)
        
        # AI Calls Log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                call_type TEXT NOT NULL,
                model_name TEXT NOT NULL,
                prompt_version TEXT NOT NULL,
                input_tokens INTEGER,
                output_tokens INTEGER,
                latency_ms INTEGER,
                status TEXT NOT NULL,
                details TEXT,
                timestamp TEXT NOT NULL
            )
        """)
        
        # App Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        conn.commit()
        conn.close()

def log_audit(action: str, target: str, details: str = "", user: str = "Investigator Miller", role: str = "investigator", case_id: str = "CASE-2026-001"):
    """Record an immutable entry in the audit trail."""
    with _lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO audit_logs (case_id, user, role, action, target, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (case_id, user, role, action, target, details, datetime.now().isoformat()))
        conn.commit()
        conn.close()

def log_ai_call(call_type: str, model_name: str, prompt_version: str, latency_ms: int, status: str, details: str = "", input_tokens: int = 0, output_tokens: int = 0):
    """Log an AI inference execution with metadata."""
    with _lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO ai_logs (call_type, model_name, prompt_version, input_tokens, output_tokens, latency_ms, status, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (call_type, model_name, prompt_version, input_tokens, output_tokens, latency_ms, status, details, datetime.now().isoformat()))
        conn.commit()
        conn.close()

def get_setting(key: str, default: str = "") -> str:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default

def set_setting(key: str, value: str):
    with _lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (key, value, datetime.now().isoformat()))
        conn.commit()
        conn.close()
