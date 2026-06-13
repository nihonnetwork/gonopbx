#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

DEFAULT_IVR_EXTENSION="3000"

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Docker CLI not found."
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: Docker Compose is not available."
    exit 1
fi

wait_for_backend() {
    local retries=60
    local attempt=1

    echo "Waiting for the backend to become healthy..."
    while [ "$attempt" -le "$retries" ]; do
        if curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
            echo "Backend is healthy."
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done

    echo "ERROR: Backend did not become healthy in time."
    return 1
}

wait_for_backend

echo "Provisioning default extensions, ring groups, and IVR..."

docker compose exec -T backend env PYTHONPATH=/app python3 - <<'PYEOF'
from database import (
    SessionLocal,
    SIPPeer,
    VoicemailMailbox,
    RingGroup,
    RingGroupMember,
    IVRMenu,
    IVROption,
    InboundRoute,
    CallForward,
    SIPTrunk,
    ConferenceRoom,
)
from pjsip_config import write_pjsip_config, reload_asterisk, DEFAULT_CODECS
from voicemail_config import write_voicemail_config, reload_voicemail
from dialplan import write_extensions_config, reload_dialplan
from queue_config import write_queues_config, reload_queues

DEFAULT_PEERS = [
    {"extension": "1000", "secret": "test1000", "caller_id": "Test User 1000"},
    {"extension": "1001", "secret": "test1001", "caller_id": "Test User 1001"},
    {"extension": "1002", "secret": "test1002", "caller_id": "Test User 1002"},
    {"extension": "1003", "secret": "test1003", "caller_id": "Test User 1003"},
    {"extension": "1004", "secret": "test1004", "caller_id": "Test User 1004"},
]

DEFAULT_RING_GROUPS = [
    {"extension": "2000", "name": "Ring Group 2000", "members": ["1000", "1001"]},
    {"extension": "2001", "name": "Ring Group 2001", "members": ["1002", "1003"]},
    {"extension": "2002", "name": "Ring Group 2002", "members": ["1004"]},
]

DEFAULT_IVR_EXTENSION = "3000"


def regenerate_configs(session):
    all_routes = session.query(InboundRoute).all()
    all_forwards = session.query(CallForward).all()
    all_mailboxes = session.query(VoicemailMailbox).all()
    all_peers = session.query(SIPPeer).all()
    all_trunks = session.query(SIPTrunk).all()
    all_groups = session.query(RingGroup).all()
    all_ivr = session.query(IVRMenu).all()
    all_conferences = session.query(ConferenceRoom).all()

    write_pjsip_config(all_peers, all_trunks, global_codecs=DEFAULT_CODECS, acl_enabled=False)
    write_voicemail_config(all_mailboxes)
    write_extensions_config(all_routes, all_forwards, all_mailboxes, all_peers, all_trunks, all_groups, all_ivr, all_conferences)
    write_queues_config(all_groups)

    reload_asterisk()
    reload_voicemail()
    reload_dialplan()
    reload_queues()


def ensure_peer(session, peer_data):
    peer = session.query(SIPPeer).filter(SIPPeer.extension == peer_data["extension"]).first()
    if peer:
        return False
    session.add(
        SIPPeer(
            extension=peer_data["extension"],
            secret=peer_data["secret"],
            caller_id=peer_data["caller_id"],
            context="internal",
            host="dynamic",
            nat="force_rport,comedia",
            type="friend",
            enabled=True,
        )
    )
    return True


def ensure_mailbox(session, extension, name):
    mailbox = session.query(VoicemailMailbox).filter(VoicemailMailbox.extension == extension).first()
    if mailbox:
        return False
    session.add(VoicemailMailbox(extension=extension, name=name, pin="1234", enabled=True))
    return True


def ensure_ring_group(session, group_data):
    group = session.query(RingGroup).filter(RingGroup.extension == group_data["extension"]).first()
    if group:
        return False
    group = RingGroup(
        name=group_data["name"],
        extension=group_data["extension"],
        strategy="ringall",
        ring_time=20,
        enabled=True,
    )
    session.add(group)
    session.flush()
    for position, member in enumerate(group_data["members"]):
        session.add(RingGroupMember(group_id=group.id, extension=member, position=position))
    return True


def ensure_ivr(session):
    menu = session.query(IVRMenu).filter(IVRMenu.extension == DEFAULT_IVR_EXTENSION).first()
    if menu:
        return False
    menu = IVRMenu(
        name="Main Menu",
        extension=DEFAULT_IVR_EXTENSION,
        prompt=None,
        timeout_seconds=5,
        timeout_destination=DEFAULT_IVR_EXTENSION,
        retries=2,
        enabled=True,
    )
    session.add(menu)
    session.flush()
    session.add(IVROption(menu_id=menu.id, digit="1", destination="1000", position=0))
    session.add(IVROption(menu_id=menu.id, digit="2", destination="2000", position=1))
    return True


session = SessionLocal()
try:
    changed = False
    for peer_data in DEFAULT_PEERS:
        changed |= ensure_peer(session, peer_data)
        changed |= ensure_mailbox(session, peer_data["extension"], peer_data["caller_id"])

    for group_data in DEFAULT_RING_GROUPS:
        changed |= ensure_ring_group(session, group_data)

    changed |= ensure_ivr(session)

    session.commit()
    regenerate_configs(session)

    print("Default provisioning complete.")
    if changed:
        print("Created missing default peers, ring groups, mailboxes, and IVR.")
    else:
        print("Nothing new was created; all defaults already existed.")
finally:
    session.close()
PYEOF

echo "Default provisioning finished."
