"""
Lector de PDF: documentos (identificados por hash del archivo, sin necesidad
de subirlos) + anotaciones (resaltados, notas al margen, marcadores).

`content_hash` (sha256, calculado en el navegador) es la clave para reconocer
un PDF local al reabrirlo: no se sube el archivo, solo se guarda su huella y
sus anotaciones viven en la BD. `POST /{id}/upload` es OPCIONAL, para quien
quiera además tener el archivo accesible desde otro dispositivo.

Nota de despliegue: en Render el disco es efímero (se borra en cada
redeploy), así que "subir a la nube" es útil en local/disco persistente; no
garantiza persistencia real en Render. Las anotaciones SIEMPRE están a salvo
porque viven en la base de datos (Neon), independientemente de esto.
"""

import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Document, Annotation, User
from api.auth import get_current_user, owner_id, scope_to_owner
from api.schemas import (
    DocumentCreate, DocumentUpdate, DocumentOut,
    AnnotationCreate, AnnotationUpdate, AnnotationOut,
    WordOut,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

_PDF_DIR = Path(__file__).parent.parent / "data" / "pdfs"
_MAX_UPLOAD_BYTES = 60 * 1024 * 1024  # 60MB, generoso para un libro/paper


def _document_out(d: Document) -> DocumentOut:
    return DocumentOut(
        id=d.id, title=d.title, content_hash=d.content_hash, storage=d.storage,
        num_pages=d.num_pages, last_page=d.last_page, last_scroll=d.last_scroll,
        last_opened_at=d.last_opened_at, created_at=d.created_at,
    )


def _annotation_out(a: Annotation) -> AnnotationOut:
    return AnnotationOut(
        id=a.id, document_id=a.document_id, page=a.page, kind=a.kind,
        selected_text=a.selected_text, note_text=a.note_text, color=a.color,
        rects=json.loads(a.rects) if a.rects else [],
        created_at=a.created_at,
    )


def _get_owned_document(db: Session, document_id: int, user: User) -> Document:
    d = scope_to_owner(db.query(Document).filter(Document.id == document_id), Document, user).one_or_none()
    if not d:
        raise HTTPException(404, "Document not found")
    return d


@router.get("/", response_model=list[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = (
        scope_to_owner(db.query(Document), Document, current_user)
        .order_by(Document.last_opened_at.desc())
        .all()
    )
    return [_document_out(d) for d in docs]


@router.get("/by-hash/{content_hash}", response_model=DocumentOut)
def get_document_by_hash(
    content_hash: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El frontend llama esto al abrir un PDF local para ver si ya existe
    (y así recuperar sus anotaciones + página de lectura). 404 si es nuevo."""
    d = scope_to_owner(
        db.query(Document).filter(Document.content_hash == content_hash), Document, current_user
    ).one_or_none()
    if not d:
        raise HTTPException(404, "Not found")
    return _document_out(d)


@router.get("/{document_id}/words", response_model=list[WordOut])
def list_document_words(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Palabras guardadas (botón 'Save word') mientras se leía este documento — alimenta el panel Vocabulary del lector."""
    _get_owned_document(db, document_id, current_user)  # valida dueño / 404 si no existe o no es tuyo
    from database.models import Word
    from api.words import _word_to_out
    words = (
        scope_to_owner(db.query(Word).filter(Word.source_document_id == document_id), Word, current_user)
        .order_by(Word.created_at.desc())
        .all()
    )
    return [_word_to_out(w) for w in words]


@router.post("/", response_model=DocumentOut, status_code=201)
def create_document(
    data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = Document(
        user_id=owner_id(current_user),
        title=data.title.strip() or "Sin título",
        content_hash=data.content_hash,
        num_pages=data.num_pages,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _document_out(d)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: int,
    data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Usado para el auto-resume ('hoy terminé acá'): guarda last_page/last_scroll
    en cada cambio de página (con debounce en el frontend)."""
    d = _get_owned_document(db, document_id, current_user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(d, field, value)
    db.commit()
    db.refresh(d)
    return _document_out(d)


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _get_owned_document(db, document_id, current_user)
    if d.storage == "uploaded" and d.file_path:
        try:
            os.remove(d.file_path)
        except OSError:
            pass
    db.delete(d)
    db.commit()


@router.post("/{document_id}/upload", response_model=DocumentOut)
async def upload_document_file(
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sube el PDF al servidor (opcional) para acceder desde otro dispositivo."""
    d = _get_owned_document(db, document_id, current_user)
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(400, "El archivo debe ser un PDF")

    _PDF_DIR.mkdir(parents=True, exist_ok=True)
    dest = _PDF_DIR / f"{owner_id(current_user) or 0}_{d.id}.pdf"

    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > _MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, "El PDF supera el tamaño máximo permitido (60MB)")
            out.write(chunk)

    d.storage = "uploaded"
    d.file_path = str(dest)
    db.commit()
    db.refresh(d)
    return _document_out(d)


@router.get("/{document_id}/file")
def get_document_file(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _get_owned_document(db, document_id, current_user)
    if d.storage != "uploaded" or not d.file_path or not os.path.exists(d.file_path):
        raise HTTPException(404, "Este documento no tiene un archivo subido")
    return FileResponse(d.file_path, media_type="application/pdf", filename=f"{d.title}.pdf")


# ── Anotaciones (resaltados, notas, marcadores) ─────────────────────────────
@router.get("/{document_id}/annotations", response_model=list[AnnotationOut])
def list_annotations(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_document(db, document_id, current_user)  # valida dueño / 404
    rows = (
        scope_to_owner(db.query(Annotation), Annotation, current_user)
        .filter(Annotation.document_id == document_id)
        .order_by(Annotation.page.asc(), Annotation.created_at.asc())
        .all()
    )
    return [_annotation_out(a) for a in rows]


@router.post("/{document_id}/annotations", response_model=AnnotationOut, status_code=201)
def create_annotation(
    document_id: int,
    data: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_document(db, document_id, current_user)  # valida dueño / 404
    a = Annotation(
        user_id=owner_id(current_user),
        document_id=document_id,
        page=data.page,
        kind=data.kind,
        selected_text=data.selected_text,
        note_text=data.note_text,
        color=data.color,
        rects=json.dumps([r.model_dump() for r in data.rects], ensure_ascii=False) if data.rects else None,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _annotation_out(a)


def _get_owned_annotation(db: Session, document_id: int, annotation_id: int, user: User) -> Annotation:
    a = scope_to_owner(
        db.query(Annotation).filter(Annotation.id == annotation_id, Annotation.document_id == document_id),
        Annotation, user,
    ).one_or_none()
    if not a:
        raise HTTPException(404, "Annotation not found")
    return a


@router.patch("/{document_id}/annotations/{annotation_id}", response_model=AnnotationOut)
def update_annotation(
    document_id: int,
    annotation_id: int,
    data: AnnotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a = _get_owned_annotation(db, document_id, annotation_id, current_user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(a, field, value)
    db.commit()
    db.refresh(a)
    return _annotation_out(a)


@router.delete("/{document_id}/annotations/{annotation_id}", status_code=204)
def delete_annotation(
    document_id: int,
    annotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a = _get_owned_annotation(db, document_id, annotation_id, current_user)
    db.delete(a)
    db.commit()
