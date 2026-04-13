# ── Stage: runtime ────────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm

# System deps + LaTeX (required for PDF generation via pdflatex)
#
# Packages and their approximate installed sizes:
#   texlive-latex-base       ~70 MB  — core LaTeX engine
#   texlive-fonts-recommended~80 MB  — standard fonts incl. lmodern, amsfonts
#   texlive-latex-extra     ~400 MB  — amsmath, geometry, multicol, etc.
#   texlive-lang-cyrillic    ~20 MB  — Cyrillic/Russian language support
#
# NOTE: texlive-fonts-extra (~800 MB) is intentionally OMITTED — it contains
# decorative/specialty fonts not required for math+Cyrillic worksheets.
# amsfonts/amssymb are provided by texlive-fonts-recommended.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-fonts-recommended \
        texlive-latex-extra \
        texlive-lang-cyrillic \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached until requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Render (and Railway) inject PORT at runtime. Default to 8000 for local Docker runs.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
