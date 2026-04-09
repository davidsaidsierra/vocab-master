"""
VocabMaster — Personal English Vocabulary Tracker
Run:  python main.py
Open: http://localhost:8000
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database.connection import init_db
from api import words, categories, reviews, stats
from api.auth import verify_api_key


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

# ── Serve frontend ──────────────────────────────────────────
app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def index():
    return FileResponse("frontend/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
