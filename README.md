# MathForge

MathForge is a full-stack educational math platform for generating practice tasks, printable worksheets, ORT-style exams, checking student solutions, and supporting teacher/student workflows.

The current project is not just a symbolic task generator. It is a working diploma-scale application with authentication, role-based dashboards, token billing, classrooms, lessons, OCR/homework analysis, RAG search over templates, text-to-speech, and an avatar tutor.

## Project Goal

MathForge is built to reduce manual work for math teachers and give students faster feedback.

The main goal is to combine deterministic symbolic math with AI-assisted explanation:

- use SymPy and template constraints to generate mathematically valid tasks;
- use LaTeX/PDF output for teacher-ready worksheets and exams;
- use OCR and algebraic validation to detect mistakes in student solutions;
- use LLMs for explanations, hints, translation, tutoring, and template extraction;
- track student progress by topic and generate adaptive practice from weak areas.

## Reality Check

Implemented and wired in the codebase:

- React/Vite frontend with Supabase login and role-based routes.
- FastAPI backend with PostgreSQL/Supabase-backed SQLAlchemy models.
- Deterministic task generation through `TaskGenerator` and seeded templates.
- Teacher PDF generation and student practice PDF/study guide generation.
- ORT Part 1/Part 2 generation plus ORT PDF variants.
- Student solution checking from typed steps and uploaded images.
- Homework checking pipeline with generated practice suggestions.
- Token wallet and generation costs.
- Teacher classrooms, join codes, classroom members, and video lessons.
- Dashboard stats, mastery tracking, and daily activity heatmap.
- RAG indexing/search for task templates through Qdrant.
- Groq-powered tutor/avatar explanation endpoints.
- TTS endpoints using `edge-tts`.
- Multilingual UI/content support for `en`, `ru`, and `kg`.

Partially implemented or deployment-dependent:

- OCR and AI features depend on external API keys and network access.
- RAG requires Qdrant and `fastembed` to be available.
- PDF generation requires a LaTeX installation with `pdflatex`.
- Video lessons store URLs; file upload/storage depends on Supabase Storage setup.
- Lean proof files exist as references, but Lean is not currently part of the request path.

Not the current reality:

- The main AI provider is not Hugging Face; current backend integrations are mainly Groq, plus optional Gemini/Google Vision configuration.
- The project is not limited to Linear Algebra and Calculus; seeded data and routes also cover algebra, ORT exam tasks, general math practice, and book-derived templates.
- Formal verification is not a core runtime feature.

## Tech Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, KaTeX, Three.js, `@pixiv/three-vrm`.
- Backend: FastAPI, SQLAlchemy async ORM, Pydantic, SymPy.
- Auth/storage: Supabase Auth, Supabase PostgreSQL, Supabase Storage for lesson video URLs.
- AI services: Groq for tutoring/explanations/template extraction; optional Gemini and Google Vision env support.
- Search/RAG: Qdrant with fastembed.
- PDF: LaTeX templates plus `pdflatex`.
- TTS/avatar: `edge-tts`, Web Speech API, VRM avatar rendering.

## Repository Structure

```text
MathForge/
  backend/
    main.py                         FastAPI entrypoint and router registration
    app/
      api/
        routes/                     Auth, tasks, OCR/study, billing, RAG, classes, lessons, tutor, TTS
      core/
        engine/                     SymPy task generation and solution validation
        generators/                 Topic-specific deterministic generators
        config.py                   Backend environment settings
      db/
        models.py                   SQLAlchemy persistence model
        seed.py                     Initial categories/templates seed data
        database.py                 Async database engine/session setup
      models/
        schemas.py                  Pydantic request/response contracts
      services/
        pdf_maker.py                LaTeX rendering and PDF compilation
        ort_generator.py            ORT task generation
        rag_service.py              Qdrant search/indexing
        rag_parser.py               PDF/book template extraction
        translator.py               AI translation helpers
    templates/
      tex/                          LaTeX templates and preamble fragments
    tests/                          Pytest coverage for generator/arbitrator behavior

  frontend/
    src/
      App.tsx                       Route tree and auth sync
      pages/                        Student, teacher, admin, auth, shared dashboards
      components/                   Layout, UI, math rendering, avatar, GeoGebra
      hooks/                        API data hooks
      lib/                          Axios and Supabase clients
      locales/                      en/ru/kg translation JSON
      store/                        Zustand auth/UI/math stores
    public/
      tutor.vrm                     Avatar model

  tts_microservice/                 Separate FastAPI TTS service prototype
  lean_proofs/                      Lean reference files
  diploma/                          Thesis and project documentation artifacts
  backend/migrations/               Manual SQL migrations
```

## Core Data Model

Main database tables:

- `users`: platform users with `admin`, `teacher`, or `student` role and `en`, `ru`, or `kg` locale.
- `billing_accounts`: token balance and daily bonus state.
- `categories`: math topic categories with JSONB translations.
- `task_templates`: SymPy-driven task templates with difficulty, title translations, and `template_json`.
- `student_tracking`: per-user/per-category mastery and last error type.
- `activity_logs`: daily activity counts for dashboard heatmaps.
- `classrooms`: teacher-owned classes with join codes.
- `classroom_members`: student membership in classrooms.
- `video_lessons`: teacher lessons assigned to classrooms.
- `site_ratings`: one satisfaction rating per user.

Typical `task_templates.template_json` shape:

```json
{
  "topic": "quadratic_equation",
  "sympy_expr": "A*x**2 + B*x + C",
  "equation_rhs": "0",
  "ranges": {
    "A": [1, 5],
    "B": [-10, 10],
    "C": [-20, 20]
  },
  "constraints": ["B**2 - 4*A*C >= 0"],
  "texts": {
    "en": "Solve: {expr} = 0",
    "ru": "Решите уравнение: {expr} = 0",
    "kg": "Теңдемени чечиңиз: {expr} = 0"
  }
}
```

The generator samples coefficients, enforces constraints, renders the concrete expression as LaTeX, solves equations when needed, and returns:

```json
{
  "topic": "quadratic_equation",
  "question_text": "Solve: $x^{2} + 5 x + 6$ = 0",
  "condition_latex": "x^{2} + 5 x + 6 = 0",
  "answer_latex": "x = -3, \\ x = -2",
  "solutions": [-3, -2],
  "coefficients": {
    "A": 1,
    "B": 5,
    "C": 6
  }
}
```

API responses usually expose only `question_text`, `condition_latex`, and `answer_latex`.

## Main Backend Routes

- `POST /api/auth/register`, `GET /api/auth/me`, `PATCH /api/auth/me`
- `GET /api/tasks/categories`
- `GET /api/tasks/templates`
- `POST /api/tasks/generate`
- `POST /api/tasks/generate/pdf`
- `POST /api/tasks/generate/practice`
- `POST /api/tasks/generate/adaptive`
- `POST /api/ort/generate`
- `POST /api/ort/generate/pdf`
- `POST /api/study/analyze`
- `POST /api/study/analyze-image`
- `POST /api/study/check-homework`
- `GET /api/study/stats`
- `GET /api/billing/balance`, `GET /api/billing/packages`, `POST /api/billing/purchase`
- `POST /api/classes`, `GET /api/classes/me`, `POST /api/classes/join/{join_code}`
- `POST /api/lessons`, `GET /api/lessons/student`, `GET /api/lessons/teacher`
- `GET /api/rag/search`, `POST /api/rag/index`
- `POST /api/tutor/chat`
- `POST /api/avatar/explain`, `POST /api/avatar/guest-explain`
- `POST /api/tts/generate`, `POST /api/tts/generate-with-timing`
- `POST /api/ratings`, `GET /api/ratings/stats`

## Frontend Routes

Public:

- `/`
- `/auth`

Authenticated:

- `/app/profile`
- `/app/dashboard`
- `/app/billing`
- `/app/math-library`

Student-facing:

- `/app/student`
- `/app/student/analyze`
- `/app/student/homework`
- `/app/student/practice`
- `/app/student/practice-pdf`
- `/app/student/lessons`

Teacher/admin:

- `/app/teacher`
- `/app/teacher/library`
- `/app/teacher/classes`
- `/app/teacher/lessons`
- `/app/admin`

## Local Development

Backend:

```powershell
cd C:\Users\asus\Desktop\MathForge
venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd C:\Users\asus\Desktop\MathForge\frontend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
npm run dev -- --host 127.0.0.1 --port 5173
```

Build frontend:

```powershell
cd C:\Users\asus\Desktop\MathForge\frontend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
npm run build
```

Run tests:

```powershell
cd C:\Users\asus\Desktop\MathForge
venv\Scripts\python.exe -m pytest
```

## Environment Variables

Backend `.env` is read by `backend/app/core/config.py`:

```text
SUPABASE_REST_URL=
SUPABASE_DB_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
GOOGLE_CLOUD_VISION_KEY=
QDRANT_URL=             # or QDRANT_ENDPOINT
QDRANT_API_KEY=
```

Frontend `.env.local`:

```text
VITE_API_URL=http://127.0.0.1:8000/api
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Current Verification Status

At the time of this README update:

```text
venv\Scripts\python.exe -m pytest
55 passed
```

Frontend production build also passes when PowerShell script execution is enabled for the current process:

```text
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
npm run build
```

Known local caveat: on Windows, `npm.ps1` may fail with execution-policy errors unless process-scoped `RemoteSigned` is set.

