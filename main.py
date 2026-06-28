"""
VocabMaster — Personal English Vocabulary Tracker
Run:  python main.py
Open: http://localhost:8000
"""

# Load .env into os.environ BEFORE importing anything that reads env vars.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional; env vars can also be set externally

from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database.connection import init_db
from api import words, categories, reviews, stats, lookup, writing, grammar, dictionary, exams, auth
from api.auth import get_current_user

BASE_DIR = Path(__file__).parent
FRONTEND_DIR = BASE_DIR / "frontend"


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="VocabMaster", version="1.0.0", lifespan=lifespan)

# ── CORS (allows Chrome extension to call the local API) ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routers ─────────────────────────────────────────────
# /api/auth (login) es público; el resto exige usuario autenticado
# (get_current_user acepta JWT Bearer y, de forma transitoria, X-API-Key legacy).
app.include_router(auth.router)
app.include_router(words.router,      dependencies=[Depends(get_current_user)])
app.include_router(categories.router, dependencies=[Depends(get_current_user)])
app.include_router(reviews.router,    dependencies=[Depends(get_current_user)])
app.include_router(stats.router,      dependencies=[Depends(get_current_user)])
app.include_router(lookup.router,     dependencies=[Depends(get_current_user)])
app.include_router(writing.router,    dependencies=[Depends(get_current_user)])
app.include_router(grammar.router,    dependencies=[Depends(get_current_user)])
app.include_router(dictionary.router, dependencies=[Depends(get_current_user)])
app.include_router(exams.router,      dependencies=[Depends(get_current_user)])

# ── Serve frontend ──────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def index():
    # no-cache: el navegador DEBE revalidar el shell HTML contra el servidor en
    # cada carga. Así el celular siempre ve la última referencia a los JS/CSS
    # versionados (?v=N) y no se queda pegado a una versión antigua del HTML.
    return FileResponse(
        str(FRONTEND_DIR / "index.html"),
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
