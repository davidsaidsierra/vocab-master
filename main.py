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
from api import words, categories, reviews, stats, lookup
from api.auth import verify_api_key

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
app.include_router(words.router,      dependencies=[Depends(verify_api_key)])
app.include_router(categories.router, dependencies=[Depends(verify_api_key)])
app.include_router(reviews.router,    dependencies=[Depends(verify_api_key)])
app.include_router(stats.router,      dependencies=[Depends(verify_api_key)])
app.include_router(lookup.router,     dependencies=[Depends(verify_api_key)])

# ── Serve frontend ──────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
