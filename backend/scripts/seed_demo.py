"""Load synthetic demo data (data/demo_seed.json): incidents, centers, volunteers and sign-ups.

Run: `make seed` (or `uv run python -m scripts.seed_demo`). Safe to re-run: previous demo data is
replaced. Incidents and centers are owned by the demo coordinator account.
"""

import asyncio
import json
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, session_factory
from app.core.security import hash_password
from app.modules.auth.enums import UserRole
from app.modules.auth.models import User
from app.modules.centers import service as centers_service
from app.modules.centers.models import Center
from app.modules.centers.schemas import CenterCreate
from app.modules.community import service as community_service
from app.modules.community.models import CommunityPost
from app.modules.community.schemas import PostCreate, ResponseCreate
from app.modules.incidents import service as incidents_service
from app.modules.incidents.enums import ReportSource
from app.modules.incidents.models import Incident
from app.modules.incidents.schemas import IncidentCreate, ReportMeta
from app.modules.volunteers import service as volunteers_service
from app.modules.volunteers.schemas import SignupCreate

SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "demo_seed.json"
DEMO_EMAIL = "demo@civiceye.dev"
DEMO_PASSWORD = "demo-password-1"


async def get_or_create_user(
    session: AsyncSession,
    email: str,
    full_name: str,
    role: UserRole = UserRole.USER,
    has_vehicle: bool = False,
) -> User:
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(DEMO_PASSWORD),
            full_name=full_name,
            role=role,
            has_vehicle=has_vehicle,
        )
        session.add(user)
        await session.commit()
    return user


async def seed_demo_data() -> None:
    seed = json.loads(SEED_FILE.read_text())
    async with session_factory() as session:
        owner = await get_or_create_user(
            session, DEMO_EMAIL, "Demo Coordinator", role=UserRole.COORDINATOR
        )
        volunteers = [
            await get_or_create_user(
                session, item["email"], item["full_name"], has_vehicle=item["has_vehicle"]
            )
            for item in seed["volunteers"]
        ]
        # Sign-ups are removed together with the incidents (cascade).
        await session.execute(delete(Incident).where(Incident.owner_id == owner.id))
        await session.execute(delete(Center).where(Center.owner_id == owner.id))
        demo_user_ids = [owner.id, *(volunteer.id for volunteer in volunteers)]
        await session.execute(
            delete(CommunityPost).where(CommunityPost.owner_id.in_(demo_user_ids))
        )
        await session.commit()

        incidents = [
            await incidents_service.create_incident(
                session,
                IncidentCreate.model_validate(item),
                owner,
                ReportMeta(source=ReportSource.SEED),
            )
            for item in seed["incidents"]
        ]
        for item in seed["centers"]:
            await centers_service.create_center(session, CenterCreate.model_validate(item), owner)
        for item in seed["followup_reports"]:
            await incidents_service.create_or_merge_incident(
                session,
                followup_report(
                    incidents[item["incident"]], seed["incidents"][item["incident"]], item
                ),
                volunteers[item["volunteer"]],
                ReportMeta(source=ReportSource.SEED, raw_text=item["summary"]),
            )
        for item in seed["community_posts"]:
            fields = {k: v for k, v in item.items() if k not in ("author", "responders")}
            post = await community_service.create_post(
                session, PostCreate.model_validate(fields), volunteers[item["author"]]
            )
            for responder in item.get("responders", []):
                await community_service.respond_to_post(
                    session,
                    post.id,
                    ResponseCreate(message="I think I can help, sending you a message."),
                    volunteers[responder],
                )
        for item in seed["signups"]:
            incident = incidents[item["incident"]]
            task_id = incident.tasks[item["task"]].id if "task" in item else None
            await volunteers_service.sign_up(
                session, incident.id, SignupCreate(task_id=task_id), volunteers[item["volunteer"]]
            )

    await engine.dispose()
    print(
        f"Seeded {len(seed['incidents'])} incidents (+{len(seed['followup_reports'])} merged "
        f"follow-up reports), {len(seed['centers'])} centers, {len(seed['signups'])} sign-ups, "
        f"{len(seed['community_posts'])} community posts."
    )
    print(f"Logins (password for all: {DEMO_PASSWORD}):")
    print(f"  coordinator: {DEMO_EMAIL}")
    for volunteer in seed["volunteers"]:
        print(f"  volunteer:   {volunteer['email']}")


def followup_report(incident: Incident, original: dict, item: dict) -> IncidentCreate:
    """A second report ~30 m from the original, so it is merged into it."""
    location = original["location"]
    return IncidentCreate(
        title=incident.title,
        summary=item["summary"],
        need_type=incident.need_type,
        urgency=item["urgency"],
        people_affected=item["people_affected"],
        location={"lat": location["lat"] + 0.0003, "lng": location["lng"]},
    )


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
