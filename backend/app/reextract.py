"""Re-run event extraction for updates already saved, e.g. after switching AI provider.

    .venv/Scripts/python.exe -m app.reextract              # every update
    .venv/Scripts/python.exe -m app.reextract --user-id 1  # one user's updates

Each update's raw text is untouched; its statements are rebuilt from it, and
categories fixed by hand are kept (see `reextract_events`).
"""

import argparse

from app.ai.factory import get_ai_provider
from app.db.session import SessionLocal
from app.models.update import Update
from app.services.event_extraction import reextract_events


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--user-id", type=int, help="only this user's updates")
    args = parser.parse_args()

    provider = get_ai_provider()
    with SessionLocal() as db:
        query = db.query(Update).order_by(Update.id)
        if args.user_id is not None:
            query = query.filter(Update.user_id == args.user_id)
        updates = query.all()
        for update in updates:
            events = reextract_events(db, update, provider)
            print(f"update {update.id}: {len(events)} statement(s)")
    print(f"Done — {len(updates)} update(s) re-extracted with {type(provider).__name__}.")


if __name__ == "__main__":
    main()
