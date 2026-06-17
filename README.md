# AI Resume Analyzer

AI Resume Analyzer is a full-stack resume intelligence app. It lets users upload resumes, index extracted resume content, score candidates against job criteria, and rank candidates through a FastAPI backend and a Vite React frontend.

## Tech Stack

- Backend: FastAPI, SQLAlchemy, SQLite, structlog
- AI and parsing: Groq, sentence transformers, Chroma-style vector indexing, PDF/DOCX parsing
- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui-style components

## Prerequisites

- Python 3.12
- Node.js 22 or newer
- npm
- A Groq API key for AI scoring

## Backend Setup

From the project root:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Update `backend/.env` with your local settings:

```bash
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=sqlite:///./data/app.db
ENVIRONMENT=development
```

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Useful backend URLs:

- API health: `http://localhost:8000/health`
- Swagger docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Frontend Setup

In a second terminal, from the project root:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend defaults to:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

Open the app at the URL printed by Vite, usually:

```text
http://localhost:5173
```

## Development Notes

- Keep `backend/.env`, `frontend/.env`, virtual environments, `node_modules`, and local database files out of Git.
- The backend creates and uses a local SQLite database at `backend/data/app.db` by default.
- Start the backend before the frontend so API calls from the UI can reach `localhost:8000`.
