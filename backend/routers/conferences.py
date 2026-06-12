from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging
import re

from database import get_db, ConferenceRoom, SIPPeer, RingGroup, IVRMenu, SIPTrunk, InboundRoute, CallForward, VoicemailMailbox, User
from auth import get_current_user
from dialplan import write_extensions_config, reload_dialplan
from queue_config import write_queues_config, reload_queues
from confbridge_config import write_confbridge_config, reload_confbridge
from audit import log_action

logger = logging.getLogger(__name__)
router = APIRouter()
PIN_RE = re.compile(r'^\d{4,12}$')


class ConferenceRoomBase(BaseModel):
    name: str
    extension: str
    pin: str | None = None
    admin_pin: str | None = None
    max_participants: int = 20
    inbound_trunk_id: int | None = None
    inbound_did: str | None = None
    enabled: bool = True


class ConferenceRoomCreate(ConferenceRoomBase):
    pass


class ConferenceRoomUpdate(ConferenceRoomBase):
    pass


class ConferenceRoomResponse(ConferenceRoomBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def _validate_room(db: Session, room: ConferenceRoomBase, current_id: int | None = None):
    by_name = db.query(ConferenceRoom).filter(ConferenceRoom.name == room.name).first()
    if by_name and by_name.id != current_id:
        raise HTTPException(status_code=400, detail="Conference room name already exists")

    by_extension = db.query(ConferenceRoom).filter(ConferenceRoom.extension == room.extension).first()
    if by_extension and by_extension.id != current_id:
        raise HTTPException(status_code=400, detail="Conference extension already exists")

    if db.query(SIPPeer).filter(SIPPeer.extension == room.extension).first():
        raise HTTPException(status_code=400, detail="Extension is already used by a SIP peer")
    if db.query(RingGroup).filter(RingGroup.extension == room.extension).first():
        raise HTTPException(status_code=400, detail="Extension is already used by a ring group")
    if db.query(IVRMenu).filter(IVRMenu.extension == room.extension).first():
        raise HTTPException(status_code=400, detail="Extension is already used by an IVR")

    if room.pin and not PIN_RE.match(room.pin):
        raise HTTPException(status_code=400, detail="PIN must be 4 to 12 digits")
    if room.admin_pin and not PIN_RE.match(room.admin_pin):
        raise HTTPException(status_code=400, detail="Admin PIN must be 4 to 12 digits")
    if room.pin and room.admin_pin and room.pin == room.admin_pin:
        raise HTTPException(status_code=400, detail="PIN and admin PIN must be different")
    if room.max_participants < 2 or room.max_participants > 200:
        raise HTTPException(status_code=400, detail="Max participants must be between 2 and 200")


def _validate_inbound_did(db: Session, trunk_id: int | None, did: str | None, current_extension: str | None = None):
    if not did:
        return
    if not trunk_id:
        raise HTTPException(status_code=400, detail="Trunk must be selected")
    trunk = db.query(SIPTrunk).filter(SIPTrunk.id == trunk_id).first()
    if not trunk:
        raise HTTPException(status_code=400, detail="Trunk not found")
    existing = db.query(InboundRoute).filter(InboundRoute.did == did).first()
    if existing and existing.destination_extension != (current_extension or ""):
        raise HTTPException(status_code=400, detail="DID is already assigned")


def _sync_inbound_route(db: Session, room: ConferenceRoom, trunk_id: int | None, did: str | None):
    if not did or not trunk_id:
        if room.inbound_did:
            existing = db.query(InboundRoute).filter(
                InboundRoute.did == room.inbound_did,
                InboundRoute.destination_extension == room.extension,
            ).first()
            if existing:
                db.delete(existing)
                db.commit()
        return

    existing = db.query(InboundRoute).filter(InboundRoute.did == did).first()
    if existing:
        if existing.destination_extension == room.extension:
            existing.trunk_id = trunk_id
            existing.description = f"Conference: {room.name}"
            db.commit()
            return
        raise HTTPException(status_code=400, detail="DID is already assigned")

    db.add(InboundRoute(
        did=did,
        trunk_id=trunk_id,
        destination_extension=room.extension,
        description=f"Conference: {room.name}",
        enabled=True,
    ))
    db.commit()


def _regenerate_all(db: Session):
    all_routes = db.query(InboundRoute).all()
    all_forwards = db.query(CallForward).all()
    all_mailboxes = db.query(VoicemailMailbox).all()
    all_peers = db.query(SIPPeer).all()
    all_trunks = db.query(SIPTrunk).all()
    all_groups = db.query(RingGroup).all()
    all_ivr = db.query(IVRMenu).all()
    all_conferences = db.query(ConferenceRoom).all()

    write_confbridge_config(all_conferences)
    reload_confbridge()
    write_extensions_config(all_routes, all_forwards, all_mailboxes, all_peers, all_trunks, all_groups, all_ivr, all_conferences)
    reload_dialplan()
    write_queues_config(all_groups)
    reload_queues()


@router.get("/", response_model=List[ConferenceRoomResponse])
def list_rooms(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ConferenceRoom).all()


@router.post("/", response_model=ConferenceRoomResponse)
def create_room(room: ConferenceRoomCreate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _validate_room(db, room)
    _validate_inbound_did(db, room.inbound_trunk_id, room.inbound_did)

    db_room = ConferenceRoom(**room.model_dump())
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    _sync_inbound_route(db, db_room, room.inbound_trunk_id, room.inbound_did)

    log_action(db, current_user.username, "conference_created", "conference", db_room.name,
               {"extension": db_room.extension}, request.client.host if request.client else None)
    _regenerate_all(db)
    return db_room


@router.put("/{room_id}", response_model=ConferenceRoomResponse)
def update_room(room_id: int, room: ConferenceRoomUpdate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_room = db.query(ConferenceRoom).filter(ConferenceRoom.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=404, detail="Conference room not found")

    _validate_room(db, room, current_id=db_room.id)
    _validate_inbound_did(db, room.inbound_trunk_id, room.inbound_did, current_extension=db_room.extension)

    old_extension = db_room.extension
    old_inbound_did = db_room.inbound_did
    old_inbound_trunk = db_room.inbound_trunk_id

    for key, value in room.model_dump().items():
        setattr(db_room, key, value)
    db_room.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_room)

    if old_extension != db_room.extension or old_inbound_did != db_room.inbound_did or old_inbound_trunk != db_room.inbound_trunk_id:
        if old_inbound_did:
            old_route = db.query(InboundRoute).filter(
                InboundRoute.did == old_inbound_did,
                InboundRoute.destination_extension == old_extension,
            ).first()
            if old_route:
                db.delete(old_route)
                db.commit()
        _sync_inbound_route(db, db_room, db_room.inbound_trunk_id, db_room.inbound_did)

    log_action(db, current_user.username, "conference_updated", "conference", db_room.name,
               {"extension": db_room.extension}, request.client.host if request.client else None)
    _regenerate_all(db)
    return db_room


@router.delete("/{room_id}")
def delete_room(room_id: int, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_room = db.query(ConferenceRoom).filter(ConferenceRoom.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=404, detail="Conference room not found")

    if db_room.inbound_did:
        route = db.query(InboundRoute).filter(
            InboundRoute.did == db_room.inbound_did,
            InboundRoute.destination_extension == db_room.extension,
        ).first()
        if route:
            db.delete(route)
            db.commit()

    name = db_room.name
    db.delete(db_room)
    db.commit()

    log_action(db, current_user.username, "conference_deleted", "conference", name, {}, request.client.host if request.client else None)
    _regenerate_all(db)
    return {"status": "ok"}
