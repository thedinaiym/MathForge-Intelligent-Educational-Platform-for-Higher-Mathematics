# MathForge 🎓

**MathForge** is an intelligent educational platform designed to automate the generation of unique mathematical problems and exam papers for university-level **Linear Algebra** and **Calculus**.

The project integrates symbolic computation (Python/SymPy) for precision, LLMs for contextualization, and Lean 4 for formal verification references.

![Badge](https://img.shields.io/badge/Status-Diploma_Project-blue)
![Badge](https://img.shields.io/badge/Backend-FastAPI-green)
![Badge](https://img.shields.io/badge/Math-SymPy-orange)
![Badge](https://img.shields.io/badge/Verification-Lean_4-purple)

---

## 🚀 Key Features

### 1. Deterministic Task Generation (No AI Hallucinations)
Unlike standard AI generators, MathForge uses **Python + SymPy** to generate problems.
- Guaranteed correct answers.
- "Clean numbers" (integers, finite decimals) via constraint satisfaction algorithms.
- **Topics:** Matrices, Determinants, Systems of Linear Equations, Derivatives, Integrals.

### 2. PDF & LaTeX Pipeline
- Automatic compilation of exam papers in A4 format ready for printing.
- Generates two files: **Student Version** (Tasks) and **Teacher Version** (Answer Keys).

### 3. AI-Enhanced Context (Hybrid Approach)
- Uses **Hugging Face Inference API** (Free Tier) to wrap abstract math problems into real-world scenarios (Physics, Economics) without altering the numerical values.
- Includes an ML-based difficulty classifier.

### 4. Formal Verification Integration
- Provides references to **Lean 4** formal proofs for generated task types, bridging the gap between computational and theoretical mathematics.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.10+, FastAPI, SQLAlchemy, Pydantic.
- **Math Engine:** SymPy, NumPy.
- **AI/ML:** Hugging Face `inference-client`, Scikit-learn.
- **Frontend:** React.js (Vite), TailwindCSS, KaTeX (for math rendering).
- **Database:** PostgreSQL.
- **Typesetting:** LaTeX (TeX Live distribution required on server).

---

## 📂 Project Structure

```text
mathforge/
├── backend/
│   ├── app/core/       # Mathematical generators (SymPy logic)
│   ├── app/services/   # PDF compilation & AI API wrapper
│   └── app/templates/  # Jinja2 templates for .tex files
├── frontend/           # React application
└── lean_proofs/        # Formal verification code snippets