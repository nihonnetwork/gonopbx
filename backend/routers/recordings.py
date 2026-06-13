"""
Call recordings API router.
"""

import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db, CallRecording, User
from auth import get_current_user

router = APIRouter()
RECORDINGS_DIR = Path(os.getenv("ASTERISK_RECORDINGS_DIR", "/var/spool/asterisk/monitor"))


class RecordingResponse(BaseModel):
    id: int
    cdr_id: Optional[int] = None
    uniqueid: str
    filename: str
    file_path: str
    mime_type: Optional[str] = None
    duration: Optional[int] = None
    size_bytes: Optional[int] = None
    src: Optional[str] = None
    dst: Optional[str] = None
    disposition: Optional[str] = None
    call_date: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[RecordingResponse])
async def list_recordings(
    limit: int = 50,
    offset: int = 0,
    src: Optional[str] = None,
    dst: Optional[str] = None,
    disposition: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CallRecording)
    if src:
        query = query.filter(CallRecording.src.ilike(f"%{src}%"))
    if dst:
        query = query.filter(CallRecording.dst.ilike(f"%{dst}%"))
    if disposition:
        query = query.filter(CallRecording.disposition == disposition.upper())
    return query.order_by(CallRecording.call_date.desc()).offset(offset).limit(limit).all()


@router.get("/count")
async def count_recordings(
    src: Optional[str] = None,
    dst: Optional[str] = None,
    disposition: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(func.count(CallRecording.id))
    if src:
        query = query.filter(CallRecording.src.ilike(f"%{src}%"))
    if dst:
        query = query.filter(CallRecording.dst.ilike(f"%{dst}%"))
    if disposition:
        query = query.filter(CallRecording.disposition == disposition.upper())
    return {"count": query.scalar() or 0}


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recording = db.query(CallRecording).filter(CallRecording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    return recording


@router.get("/{recording_id}/download")
async def download_recording(
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recording = db.query(CallRecording).filter(CallRecording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    file_path = Path(recording.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found on disk")
    return FileResponse(path=str(file_path), filename=recording.filename, media_type=recording.mime_type or "audio/wav")


@router.get("/{recording_id}/play")
async def play_recording(
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recording = db.query(CallRecording).filter(CallRecording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    file_path = Path(recording.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found on disk")
    return FileResponse(path=str(file_path), filename=recording.filename, media_type=recording.mime_type or "audio/wav")
