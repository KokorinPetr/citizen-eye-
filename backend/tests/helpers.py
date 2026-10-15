"""Helpers shared by all test modules."""

import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy import update

from app.core.database import session_factory
from app.modules.auth.enums import UserRole
from app.modules.auth.models import User

DEFAULT_PASSWORD = "strong-password-1"


async def register_user(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    data = {
        "email": f"user-{uuid.uuid4().hex[:8]}@example.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Test User",
        **overrides,
    }
    response = await client.post("/auth/register", json=data)
    assert response.status_code == 201, response.text
    return response.json()


async def auth_headers(client: AsyncClient, role: UserRole = UserRole.USER) -> dict[str, str]:
    """Register a fresh user (optionally with a role) and return its Authorization header."""
    body = await register_user(client)
    if role != UserRole.USER:
        async with session_factory() as session:
            await session.execute(
                update(User).where(User.id == uuid.UUID(body["user"]["id"])).values(role=role)
            )
            await session.commit()
    return bearer(body["tokens"]["access_token"])


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


INCIDENTS_URL = "/incidents"
INSIDE_BBOX = {"lat": 13.8167, "lng": 100.5612}  # Lat Phrao
OUTSIDE_BBOX = {"lat": 13.6900, "lng": 100.7500}  # near Suvarnabhumi
MAP_BBOX = "100.50,13.75,100.62,13.85"


def incident_data(**overrides: Any) -> dict[str, Any]:
    return {
        "title": "Elderly woman needs medicine",
        "summary": "Water up to knee level on Soi 12",
        "need_type": "medicine",
        "urgency": "high",
        "people_affected": 3,
        "location": INSIDE_BBOX,
        "location_text": "Soi 12, Lat Phrao",
        **overrides,
    }


async def create_incident(client: AsyncClient, headers: dict[str, str], **overrides: Any) -> dict:
    response = await client.post(INCIDENTS_URL, json=incident_data(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()
