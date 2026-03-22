# CLAUDE.md — MathForge

This file provides guidance to Claude Code when working with this repository.
Read this file fully before making any changes.

---

## Project Overview

**MathForge** is a multilingual **Neuro-Symbolic** educational platform for university-level
Linear Algebra and Calculus. It separates:
- **Deterministic math** → SymPy (100% correct, no hallucinations)
- **Natural language / hints** → Groq API Llama-3 (NLP only, never solves math)
- **Formal verification** → Lean 4 (optional)
- **Vector search** → Qdrant (RAG for teacher textbook uploads)

Languages supported: **English, Russian, Kyrgyz** (i18n via react-i18next).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), TypeScript, TailwindCSS, Zustand, React Hook Form + Yup, react-i18next |
| Backend | FastAPI (Python 3.11+), Pydantic, SQLAlchemy |
| Database | Supabase (PostgreSQL) — JSONB for i18n fields |
| Vector DB | Qdrant |
| Math Engine | SymPy |
| LLM | Groq API (Llama-3) — NLP only |
| RAG | LangChain |
| Vision/OCR | Google Cloud Vision API |
| PDF | pdflatex (MiKTeX or TeX Live) |

---

## Development Commands

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://127.0.0.1:8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## Environment Variables

### Backend `.env`
```
SUPABASE_REST_URL=
SUPABASE_DB_URL=           # postgresql:// connection string
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=            # Reserved, not actively used
GOOGLE_CLOUD_VISION_KEY=   # For OCR endpoint
QDRANT_URL=                # Qdrant instance URL
QDRANT_API_KEY=
```

### Frontend
Supabase client initialized in `frontend/src/lib/supabase.js`.
All API calls must include `Accept-Language: {current_lang}` via Axios interceptor.

---

## Database Schema (Supabase PostgreSQL)

All user-facing text fields use **JSONB** for multilingual support.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| role | Enum | 'admin', 'teacher', 'student' |
| name | String | |
| locale | Enum | 'en', 'ru', 'kg' — default 'ru' |
| created_at | Timestamp | |

### `billing_accounts`
| Column | Type | Notes |
|---|---|---|
| user_id | UUID PK FK→users | |
| token_balance | Integer | Default 0, constraint >= 0 |

### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name_translations | JSONB | `{"en": "Calculus", "ru": "Матанализ", "kg": "..."}` |

### `task_templates`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| category_id | UUID FK→categories | |
| difficulty | Enum | 'easy', 'medium', 'hard' |
| title_translations | JSONB | `{"en": "Quadratic", "ru": "Квадратные"}` |
| template_json | JSONB | SymPy rules, variables, constraints, i18n prompts |
| is_active | Boolean | |

**Sample `template_json`:**
```json
{
  "topic": "quadratic_equation",
  "sympy_expr": "A*x**2 + B*x + C",
  "ranges": {"A": [1, 5], "B": [-10, 10], "C": [-20, 20]},
  "constraints": ["B**2 - 4*A*C >= 0"],
  "texts": {
    "en": "Solve: {expr} = 0",
    "ru": "Решите уравнение: {expr} = 0",
    "kg": "Теңдемени чечиңиз: {expr} = 0"
  }
}
```

### `student_tracking`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | |
| category_id | UUID FK→categories | |
| mastery_level | Float | 0.0 to 100.0 |
| last_error_type | String | |

---

## Backend Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py
│   │   │   ├── tasks.py
│   │   │   ├── ocr.py
│   │   │   └── billing.py
│   │   └── dependencies.py   # locale extractor from headers, auth guards
│   ├── core/
│   │   ├── config.py
│   │   └── engine/
│   │       ├── generator.py  # TaskGenerator (SymPy)
│   │       ├── arbitrator.py # Step-by-step OCR validator (SymPy)
│   │       └── llm_agent.py  # LangChain + Groq
│   ├── models/               # Pydantic schemas
│   ├── services/
│   │   ├── ai_client.py      # get_hint_from_groq()
│   │   ├── rag_parser.py     # extract_template_from_pdf_text()
│   │   └── pdf_maker.py      # LaTeX + pdflatex
│   └── main.py
├── tests/
└── requirements.txt
```

---

## Core Engine Logic

### ⚙️ TaskGenerator (`app/core/engine/generator.py`)
- Accepts `template_json` from DB — **never hardcode math topics**
- Parses JSON, generates random coefficients within `ranges`
- Validates constraints using SymPy (e.g., `b^2 - 4ac >= 0`)
- Computes exact answer via `sympy.solve()`
- Injects correct locale string from `template_json["texts"][user_locale]`
- Returns final LaTeX string

### ⚙️ Step-by-Step Arbitrator (`app/core/engine/arbitrator.py`)
- Input: array of LaTeX strings (from OCR)
- For each consecutive pair of steps: compute `simplify(Step_N - Step_{N+1})`
- If result == 0 → transition is valid
- If result != 0 → flag error at that index
- **Never use LLM for validation — SymPy only**

### ⚙️ LLM Hint Generator (`app/core/engine/llm_agent.py`)
- Groq **MUST NOT** solve equations
- System prompt template:
  > "You are an empathetic math tutor. The student made a mistake in step {error_step}.
  > The correct mathematical transition is {sympy_correct_step}.
  > Explain the rule they broke in {user_locale} language.
  > Output text explanation only — no formulas."

---

## API Endpoints

### `GET /api/categories`
- Header: `Accept-Language: ru`
- Response: `[{"id": "uuid", "name": "Матанализ"}]` (resolved from JSONB)

### `POST /api/study/analyze`
- Payload: `multipart/form-data` (image file)
- Logic: deduct 1 token → OCR → SymPy Arbitrator → Groq hint → update `student_tracking`
- Response:
```json
{
  "status": "error_found",
  "error_step": 2,
  "hint_text": "Вы забыли поменять знак при раскрытии скобок"
}
```

### `POST /api/tasks/generate`
- Payload: `{"category_id": "uuid", "difficulty": "easy", "count": 10}`
- Logic: fetch `template_json` → TaskGenerator → compile LaTeX → pdflatex
- Response: `{"pdf_url": "https://..."}`

### `GET /api/billing/balance`
- Response: `{"token_balance": 42}`

---

## Frontend Structure

```
frontend/src/
├── components/
│   ├── layout/        # Sidebar, Header (Language Switcher)
│   ├── math/          # LaTeX renderer (KaTeX or MathJax)
│   └── ui/            # Buttons, Inputs, Modals
├── hooks/             # React Query custom hooks
├── locales/           # en.json, ru.json, kg.json
├── pages/
│   ├── auth/          # Login, Register
│   ├── shared/        # Profile, Billing
│   ├── student/       # Dashboard (Tracking Map), AnalyzeSolve, GeneratePDF
│   └── teacher/       # Dashboard, Library (RAG Upload), AdvancedGenerate
├── store/             # Zustand: user session, token balance
├── App.tsx            # React Router v6
└── i18n.ts            # react-i18next config
```

### Routes
| Path | Component | Access |
|---|---|---|
| `/` | HomePage | Public |
| `/auth` | AuthPage | Public |
| `/app/profile` | Profile | Authenticated |
| `/app/student` | StudentAnalyzer | Student only |
| `/app/teacher` | TeacherGenerator | Teacher only |
| `/app/admin` | AdminDataset | Teacher/Admin |

### i18n Rules
- All user-facing strings must use `t()` from `useTranslation()`
- Axios interceptor must send `Accept-Language: {current_lang}` on every request
- Generate PDF form: use React Hook Form + Yup, constrain `question_num <= 50`

---

## Implementation Phases

Follow these phases in order. Do not skip ahead.

- **Phase 1** — Project structure, monorepo setup, react-i18next configuration
- **Phase 2** — Supabase schema via SQLAlchemy/SQLModel, all Pydantic models
- **Phase 3** — TaskGenerator (SymPy engine), test with sample `template_json`
- **Phase 4** — React frontend routes and UI shells
- **Phase 5** — Groq API + LangChain RAG integration

---

## Critical Constraints — READ BEFORE EVERY CHANGE

1. **Neuro-Symbolic boundary is sacred**: never prompt Groq to solve an equation. All math → SymPy.
2. **i18n everywhere**: all DB queries must resolve JSONB translations using `user_locale`.
3. **Token billing**: every `/api/study/analyze` call must deduct 1 token atomically. Fail if balance = 0.
4. **PDF requires pdflatex**: ensure TeX is installed on server. Handle subprocess errors gracefully.
5. **Admin approve endpoint** needs server-side role check — do not rely on frontend gating only.