# ── Stage: runtime ────────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm

# System deps + LaTeX (required for PDF generation via pdflatex)
# NOTE: texlive packages add ~600 MB to the image — expected, not a mistake.
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra \
    texlive-lang-cyrillic \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached until requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Render (and Railway) inject PORT at runtime. Default to 8000 for local Docker runs.
# Shell form is required so $PORT is expanded at container start, not build time.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
