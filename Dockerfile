# CaseBoard AI - All-in-one container
# Serves backend REST API + frontend static files on port 8080
FROM python:3.11-slim

WORKDIR /app

# Ensure unbuffered output and set defaults
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV CASEBOARD_DB_PATH=/app/data/caseboard.db

# Copy dependency list first (layer cache)
COPY requirements.txt /app/requirements.txt
RUN if [ -s requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Copy application source
COPY backend/  /app/backend/
COPY frontend/ /app/frontend/
COPY run.py    /app/run.py

# Persistent SQLite directory
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["python", "run.py"]
