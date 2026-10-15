"""Lots of SYNTHETIC data around Bangkok, to see how the map and lists behave when busy.

Run: `make seed-bangkok`. Deterministic (same data every run) and safe to re-run: everything is
owned by `bulk-*@civiceye.dev` accounts and replaced on each run. `make seed` is not affected.
"""

import asyncio
import random

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import engine, session_factory
from app.core.exceptions import ConflictError
from app.core.security import hash_password
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

RANDOM_SEED = 42
PASSWORD = "demo-password-1"
EMAIL_DOMAIN = "civiceye.dev"
VOLUNTEER_COUNT = 30
INCIDENT_COUNT = 70
POST_COUNT = 40
CENTER_COUNT = 15
# Greater Bangkok, roughly Nonthaburi to Samut Prakan
BANGKOK_BOX = (100.42, 13.62, 100.72, 13.92)  # min_lng, min_lat, max_lng, max_lat

DISTRICTS = [
    "Lat Phrao",
    "Bang Kapi",
    "Don Mueang",
    "Chatuchak",
    "Huai Khwang",
    "Bang Sue",
    "Din Daeng",
    "Bang Khen",
    "Sai Mai",
    "Min Buri",
    "Lat Krabang",
    "Bang Na",
    "Phra Khanong",
    "Khlong Toei",
    "Thon Buri",
    "Bangkok Noi",
    "Taling Chan",
    "Bang Phlat",
    "Nonthaburi",
    "Rangsit",
]

INCIDENT_TEMPLATES = {
    "evacuation": [
        (
            "Elderly couple can't leave the house",
            "Water is waist-deep, they need help to reach dry ground.",
        ),
        ("Family stuck on the second floor", "Ground floor flooded, two children in the house."),
        ("Man in a wheelchair needs to get out", "Street flooded, he can't move the wheelchair."),
    ],
    "boat": [
        ("People trapped, need a boat", "Water rising fast, several houses cut off."),
        ("Need a boat to reach the main road", "Soi completely under water, knee to chest deep."),
    ],
    "medicine": [
        ("Grandmother ran out of insulin", "Clinic road is flooded, she needs insulin today."),
        ("Need blood pressure medicine", "Elderly man, medicine finished yesterday."),
    ],
    "medical": [
        ("Injured while clearing debris", "Deep cut on the leg, needs first aid."),
        ("Child with high fever", "Can't reach the hospital, the road is flooded."),
    ],
    "food": [
        ("Families need food packs", "About 20 people have had no food delivery for two days."),
        ("Temple kitchen running out of rice", "Cooking for people staying at the temple."),
    ],
    "water": [
        ("Need drinking water", "Tap water is dirty after the flood."),
        ("Community needs bottled water", "Around 40 people, water runs out tonight."),
    ],
    "shelter": [
        ("Family lost their ground floor", "Need a dry place to sleep for a few nights."),
    ],
    "other": [
        ("Help moving things upstairs", "Water rising slowly, want to save furniture."),
        ("Need sandbags at the shop", "Small shop, water coming in at the door."),
    ],
}
NEED_WEIGHTS = {
    "evacuation": 3,
    "boat": 2,
    "medicine": 2,
    "medical": 2,
    "food": 3,
    "water": 2,
    "shelter": 1,
    "other": 2,
}
URGENCY_WEIGHTS = {"critical": 1, "high": 3, "medium": 4, "low": 2}
TASKS_BY_NEED = {
    "evacuation": [("Help people walk out", "carrier", 2), ("Drive to dry area", "driver", 1)],
    "boat": [("Boat pickup", "boat_operator", 1), ("Help people into the boat", "carrier", 2)],
    "medicine": [("Deliver the medicine", "driver", 1)],
    "medical": [("First aid", "medic", 1), ("Drive to hospital", "driver", 1)],
    "food": [("Deliver food packs", "driver", 1), ("Cook", "cook", 2)],
    "water": [("Deliver water bottles", "driver", 2)],
    "shelter": [("Drive the family to a shelter", "driver", 1)],
    "other": [("Carry things upstairs", "carrier", 3)],
}

POST_TEMPLATES = {
    "lost_pet": [
        (
            "Lost orange cat",
            {"species": "cat", "colour": "orange"},
            "Very friendly, answers to Som.",
        ),
        ("Lost small white dog", {"species": "dog", "colour": "white"}, "Wearing a red collar."),
        ("Lost grey parrot", {"species": "parrot", "colour": "grey"}, "Flew away this morning."),
    ],
    "found_pet": [
        ("Found black puppy", {"species": "dog", "colour": "black"}, "Now safe at my house."),
        (
            "Found tabby cat near the market",
            {"species": "cat", "colour": "tabby"},
            "Has a collar, no tag.",
        ),
    ],
    "lost_item": [
        ("Lost wallet with ID card", {"item": "wallet"}, "Brown leather wallet."),
        ("Lost keys on a blue keyring", {"item": "keys"}, "Three keys and a small torch."),
        ("Lost phone in a taxi", {"item": "phone"}, "Black phone with a green case."),
    ],
    "found_item": [
        ("Found a school bag", {"item": "bag"}, "Pink bag with books inside."),
        ("Found glasses at the bus stop", {"item": "glasses"}, "Black frame, in a case."),
    ],
    "help_wanted": [
        ("Help carrying groceries upstairs", {}, "My mother has bad knees, 4th floor, no lift."),
        ("Need someone to fix a fan", {}, "Ceiling fan stopped working."),
        ("Looking for a dog walker", {}, "Weekday mornings, friendly dog."),
        ("Help moving a sofa", {}, "Moving to the next soi on Saturday."),
    ],
    "help_offered": [
        ("Pickup truck for small moves", {"vehicle": "pickup truck"}, "Weekends, fuel money only."),
        ("Free English lessons for kids", {}, "Saturday afternoons at the community hall."),
        ("Can repair bicycles", {}, "Bring it to my shop in the soi."),
    ],
    "other": [
        ("Community clean-up on Sunday", {}, "Meet at the temple at 8 am."),
    ],
}
POST_WEIGHTS = {
    "lost_pet": 4,
    "found_pet": 2,
    "lost_item": 3,
    "found_item": 2,
    "help_wanted": 4,
    "help_offered": 3,
    "other": 1,
}


def weighted(rng: random.Random, weights: dict[str, int]) -> str:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def random_point(rng: random.Random) -> dict[str, float]:
    min_lng, min_lat, max_lng, max_lat = BANGKOK_BOX
    return {
        "lat": round(rng.uniform(min_lat, max_lat), 5),
        "lng": round(rng.uniform(min_lng, max_lng), 5),
    }


async def get_or_create_user(session: AsyncSession, email: str, name: str, vehicle: bool) -> User:
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(
            email=email, password_hash=hash_password(PASSWORD), full_name=name, has_vehicle=vehicle
        )
        session.add(user)
        await session.commit()
    return user


async def seed_bangkok() -> None:
    rng = random.Random(RANDOM_SEED)
    first_names = [
        "Somchai",
        "Malee",
        "Anan",
        "Kanya",
        "Niran",
        "Pim",
        "Arthit",
        "Dao",
        "Krit",
        "Nok",
    ]

    async with session_factory() as session:
        owner = await get_or_create_user(
            session, f"bulk-owner@{EMAIL_DOMAIN}", "Bangkok Neighbours", False
        )
        volunteers = [
            await get_or_create_user(
                session,
                f"bulk-{i}@{EMAIL_DOMAIN}",
                f"{first_names[i % len(first_names)]} {i}",
                vehicle=i % 3 == 0,
            )
            for i in range(VOLUNTEER_COUNT)
        ]
        bulk_ids = [owner.id, *(v.id for v in volunteers)]
        await session.execute(delete(Incident).where(Incident.owner_id.in_(bulk_ids)))
        await session.execute(delete(Center).where(Center.owner_id.in_(bulk_ids)))
        await session.execute(delete(CommunityPost).where(CommunityPost.owner_id.in_(bulk_ids)))
        await session.commit()

        incidents = []
        for _ in range(INCIDENT_COUNT):
            need = weighted(rng, NEED_WEIGHTS)
            title, summary = rng.choice(INCIDENT_TEMPLATES[need])
            district = rng.choice(DISTRICTS)
            reporter = rng.choice(volunteers)
            data = IncidentCreate(
                title=title,
                summary=summary,
                need_type=need,
                urgency=weighted(rng, URGENCY_WEIGHTS),
                people_affected=rng.choice([1, 2, 3, 4, 6, 10, 20]),
                location=random_point(rng),
                location_text=f"Soi {rng.randint(1, 80)}, {district}",
                tasks=[
                    {"title": t, "role": r, "needed_count": n} for t, r, n in TASKS_BY_NEED[need]
                ],
            )
            incident, _ = await incidents_service.create_or_merge_incident(
                session, data, reporter, ReportMeta(source=ReportSource.SEED)
            )
            incidents.append((incident, data, reporter))

        # ~20% get a follow-up report from another person nearby → merged, verified, bigger
        merged = 0
        for _incident, data, reporter in rng.sample(incidents, k=INCIDENT_COUNT // 5):
            other = rng.choice([v for v in volunteers if v.id != reporter.id])
            followup = IncidentCreate.model_validate(
                {
                    **data.model_dump(),
                    "location": {"lat": data.location.lat + 0.0004, "lng": data.location.lng},
                    "urgency": rng.choice(["high", "critical"]),
                    "summary": "Neighbour confirms: still waiting for help.",
                }
            )
            await incidents_service.create_or_merge_incident(
                session, followup, other, ReportMeta(source=ReportSource.SEED)
            )
            merged += 1

        # Volunteers going (max 2 active sign-ups each)
        signups = 0
        free_slots = {v.id: 2 for v in volunteers}
        for incident, _, _ in rng.sample(incidents, k=INCIDENT_COUNT // 2):
            candidates = [v for v in volunteers if free_slots[v.id] > 0]
            if not candidates:
                break
            for volunteer in rng.sample(candidates, k=min(len(candidates), rng.randint(1, 2))):
                try:
                    await volunteers_service.sign_up(
                        session, incident.id, SignupCreate(), volunteer
                    )
                except ConflictError:  # task full / already going: refused before any write
                    continue
                free_slots[volunteer.id] -= 1
                signups += 1

        for i in range(CENTER_COUNT):
            is_shelter = i % 3 != 0
            await centers_service.create_center(
                session,
                CenterCreate(
                    name=f"{rng.choice(['Wat', 'School', 'Community hall', 'Market'])} "
                    f"{rng.choice(DISTRICTS)} {'shelter' if is_shelter else 'supply point'}",
                    center_type="shelter" if is_shelter else "supply_point",
                    description="Dry floor, volunteers on site."
                    if is_shelter
                    else "Food and water handed out daily.",
                    location=random_point(rng),
                    capacity=rng.choice([50, 80, 120, 200]) if is_shelter else None,
                    supplies=["shelter", "food", "water"]
                    if is_shelter
                    else ["food", "water", "medicine"],
                ),
                owner,
            )

        for _ in range(POST_COUNT):
            category = weighted(rng, POST_WEIGHTS)
            title, details, description = rng.choice(POST_TEMPLATES[category])
            author = rng.choice(volunteers)
            with_reward = (
                category in ("lost_pet", "lost_item", "help_wanted") and rng.random() < 0.6
            )
            post = await community_service.create_post(
                session,
                PostCreate(
                    category=category,
                    title=title,
                    description=description,
                    details=details,
                    location=random_point(rng),
                    location_text=rng.choice(DISTRICTS),
                    reward_amount=rng.choice([200, 300, 500, 1000, 2000]) if with_reward else None,
                ),
                author,
            )
            if rng.random() < 0.4:
                responder = rng.choice([v for v in volunteers if v.id != author.id])
                await community_service.respond_to_post(
                    session, post.id, ResponseCreate(message="I can help, message me."), responder
                )

    await engine.dispose()
    print(
        f"Bangkok: {INCIDENT_COUNT} reports (+{merged} merged follow-ups), {signups} sign-ups, "
        f"{CENTER_COUNT} shelters/supply points, {POST_COUNT} community posts."
    )
    print(f"Logins: bulk-0@{EMAIL_DOMAIN} … bulk-{VOLUNTEER_COUNT - 1}@{EMAIL_DOMAIN} / {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed_bangkok())
