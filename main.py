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

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from database.connection import init_db
from api import words, categories, reviews, stats, lookup, writing, grammar, dictionary, exams, auth, admin, documents
from api.auth import get_current_user

BASE_DIR = Path(__file__).parent
FRONTEND_DIR = BASE_DIR / "frontend"


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="VocabMaster", version="1.0.0", lifespan=lifespan)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        # Assets estáticos (JS/CSS): revalidar SIEMPRE contra el servidor. Sin
        # esto el navegador los cachea por heurística y tras un deploy podría
        # seguir ejecutando módulos viejos. Con ETag la revalidación es barata
        # (304 si no cambió). Los módulos ES se importan sin ?v=, así que este
        # header es lo que garantiza que un cambio de frontend llegue al usuario.
        if request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-cache"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ── CORS ─────────────────────────────────────────────────────
# Solo orígenes conocidos: el frontend (local + Render) y la extensión de
# Chrome. EXTENSION_ORIGIN (chrome-extension://<id>) se agrega por env var
# porque el ID de la extensión depende de cómo se instaló/empaquetó.
_ALLOWED_ORIGINS = [
    "https://vocab-master-re2t.onrender.com",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]
_extension_origin = os.environ.get("EXTENSION_ORIGIN", "").strip()
if _extension_origin:
    _ALLOWED_ORIGINS.append(_extension_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── API routers ─────────────────────────────────────────────
# /api/auth (login) es público; el resto exige usuario autenticado
# (get_current_user valida el JWT Bearer; el admin gestiona sus endpoints).
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(words.router,      dependencies=[Depends(get_current_user)])
app.include_router(categories.router, dependencies=[Depends(get_current_user)])
app.include_router(reviews.router,    dependencies=[Depends(get_current_user)])
app.include_router(stats.router,      dependencies=[Depends(get_current_user)])
app.include_router(lookup.router,     dependencies=[Depends(get_current_user)])
app.include_router(writing.router,    dependencies=[Depends(get_current_user)])
app.include_router(grammar.router,    dependencies=[Depends(get_current_user)])
app.include_router(dictionary.router, dependencies=[Depends(get_current_user)])
app.include_router(exams.router,      dependencies=[Depends(get_current_user)])
app.include_router(documents.router,  dependencies=[Depends(get_current_user)])

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
