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
from fastapi.responses import FileResponse, Response
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
    # Disable caching so mobile browsers always get the latest HTML shell
    response = FileResponse(str(FRONTEND_DIR / "index.html"))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


if __name__ == "__main__":
    import uvicorn
    import socket

    # Print the local IP so you can open the site from a phone/tablet on the
    # same WiFi (e.g. http://192.168.1.50:8000)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        print(f"\n  ✦ VocabMaster corriendo en:")
        print(f"     PC      →  http://localhost:8000")
        print(f"     Móvil   →  http://{local_ip}:8000\n")
    except Exception:
        pass

    # host="0.0.0.0" accepts connections from any device on your local network
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
