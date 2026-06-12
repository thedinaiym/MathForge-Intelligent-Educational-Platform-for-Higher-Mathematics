# ══════════════════════════════════════════════════════════════════════════════
# MathForge TTS Microservice — Dockerfile (production)
#
# No torch.  No ML models.  Just edge-tts + fastapi.
# Final image size: ~150 MB.  Cold-start on Railway: < 5 s.
# ══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim-bookworm

# Patch base OS packages to eliminate known CVEs before adding app layers.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
        espeak-ng \
        git \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cached layer unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Railway injects $PORT.  Fallback to 8001 for local docker run.
ENV TTS_PORT=8001
ENV TTS_LOG_LEVEL=info

EXPOSE 8001

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c \
        "import urllib.request; \
         import os; \
         port = os.getenv('PORT', os.getenv('TTS_PORT', '8001')); \
         urllib.request.urlopen(f'http://localhost:{port}/health')"

CMD ["python", "main.py"]
