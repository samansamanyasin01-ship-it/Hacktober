"""
CaseBoard AI - Root Runner
Starts the backend server and serves both REST APIs and the frontend dashboard.
"""

import os
import sys

# Ensure backend folder is in Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from server import run_server

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"==================================================")
    print(f" CaseBoard AI - Decision Support System")
    print(f" Port: {port}")
    print(f" Local URL: http://127.0.0.1:{port}")
    print(f" DigitalOcean Target: Gradient Serverless Inference")
    print(f" Safeguard: Decision Support Only. Not Evidence.")
    print(f"==================================================")
    run_server(port)
