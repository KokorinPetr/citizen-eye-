from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.core.base_model import utc_now
from app.core.database import session_factory
from app.integrations.ai.factory import get_ai_connector
from app.integrations.ai.providers.fake import FakeConnector
from app.main import app
from app.modules.auth.enums import UserRole
from app.modules.community.models import CommunityPost
from app.modules.community.schemas import ParsedPost
from tests.helpers import auth_headers, bearer, register_user

POSTS_URL = "/community/posts"
SOI_12 = {"lat": 13.8167, "lng": 100.5612}
CHIANG_MAI = {"lat": 18.7883, "lng": 98.9853}


def post_data(**overrides: Any) -> dict[str, Any]:
    return {
        "category": "lost_pet",
        "title": "Lost white cat Mali",
        "description": "Blue collar, very shy.",
        "details": {"species": "cat", "colour": "white"},
        "location": SOI_12,
        "reward_amount": 2000,
        "reward_note": "PromptPay QR when found",
        "contact_phone": "+66 81 555 0000",
        **overrides,
    }


async def create_post(client: AsyncClient, headers: dict, **overrides: Any) -> dict:
    response = await client.post(POSTS_URL, json=post_data(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def respond(client: AsyncClient, post_id: str, headers: dict, message: str = "I saw her!"):
    return await client.post(
        f"{POSTS_URL}/{post_id}/responses", json={"message": message}, headers=headers
    )


async def test_create_post_requires_login(client: AsyncClient) -> None:
    assert (await client.post(POSTS_URL, json=post_data())).status_code == 401


async def test_create_and_read_post(client: AsyncClient) -> None:
    author = await register_user(client, full_name="Malee")
    headers = bearer(author["tokens"]["access_token"])

    post = await create_post(client, headers)
    anonymous = (await client.get(f"{POSTS_URL}/{post['id']}")).json()

    assert post["status"] == "open"
    assert post["owner"] == {"id": author["user"]["id"], "full_name": "Malee", "has_vehicle": False}
    assert post["details"] == {"species": "cat", "colour": "white"}
    assert post["contact_phone"] == "+66 81 555 0000"
    assert post["platform_fee_preview"] == 100  # 5% of 2000, pitch only
    assert anonymous["contact_phone"] is None  # hidden from anonymous viewers


async def test_reward_is_optional(client: AsyncClient) -> None:
    post = await create_post(
        client,
        await auth_headers(client),
        category="help_wanted",
        title="Help carrying groceries to 3rd floor",
        reward_amount=None,
        reward_note=None,
        details={},
    )

    assert post["reward_amount"] is None
    assert post["platform_fee_preview"] is None


async def test_list_filters(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    cat = await create_post(client, headers)
    dog = await create_post(client, headers, category="found_pet", title="Found brown dog")
    help_ = await create_post(
        client, headers, category="help_wanted", title="Need help moving", reward_amount=None
    )
    far = await create_post(client, headers, title="Lost cat in Chiang Mai", location=CHIANG_MAI)

    async def ids(**params: Any) -> set[str]:
        return {p["id"] for p in (await client.get(POSTS_URL, params=params)).json()}

    assert await ids(category=["lost_pet", "found_pet"]) == {cat["id"], dog["id"], far["id"]}
    assert await ids(has_reward="true") == {cat["id"], dog["id"], far["id"]}
    assert await ids(has_reward="false") == {help_["id"]}
    assert await ids(bbox="100.50,13.75,100.62,13.85") == {cat["id"], dog["id"], help_["id"]}


async def test_only_author_or_coordinator_can_edit_close_delete(client: AsyncClient) -> None:
    author = await auth_headers(client)
    stranger = await auth_headers(client)
    coordinator = await auth_headers(client, role=UserRole.COORDINATOR)
    post = await create_post(client, author)
    url = f"{POSTS_URL}/{post['id']}"

    assert (await client.patch(url, json={"title": "Hacked"}, headers=stranger)).status_code == 403
    assert (await client.post(f"{url}/close", headers=stranger)).status_code == 403
    assert (await client.delete(url, headers=stranger)).status_code == 403

    edited = await client.patch(url, json={"reward_amount": 3000}, headers=author)
    assert edited.json()["reward_amount"] == 3000
    assert (await client.post(f"{url}/close", headers=coordinator)).json()["status"] == "closed"
    assert (await client.delete(url, headers=author)).status_code == 204


async def test_responses_are_private_to_author_and_responder(client: AsyncClient) -> None:
    author = await auth_headers(client)
    finder = await auth_headers(client)
    other = await auth_headers(client)
    post = await create_post(client, author)
    await respond(client, post["id"], finder, "Saw a white cat near 7-Eleven")
    await respond(client, post["id"], other, "Maybe in my garden?")

    by_author = (await client.get(f"{POSTS_URL}/{post['id']}/responses", headers=author)).json()
    by_finder = (await client.get(f"{POSTS_URL}/{post['id']}/responses", headers=finder)).json()
    public_post = (await client.get(f"{POSTS_URL}/{post['id']}")).json()

    assert len(by_author) == 2
    assert [r["message"] for r in by_finder] == ["Saw a white cat near 7-Eleven"]
    assert public_post["response_count"] == 2  # public sees only the count


async def test_response_rules(client: AsyncClient) -> None:
    author = await auth_headers(client)
    finder = await auth_headers(client)
    post = await create_post(client, author)

    assert (await respond(client, post["id"], author)).status_code == 409  # own post
    assert (await respond(client, post["id"], finder)).status_code == 201
    assert (await respond(client, post["id"], finder)).status_code == 409  # twice


async def test_accept_matches_post_and_declines_others(client: AsyncClient) -> None:
    author = await auth_headers(client)
    finder = await auth_headers(client)
    other = await auth_headers(client)
    post = await create_post(client, author)
    finder_response = (await respond(client, post["id"], finder)).json()
    await respond(client, post["id"], other)
    accept_url = f"{POSTS_URL}/{post['id']}/responses/{finder_response['id']}/accept"

    assert (await client.post(accept_url, headers=finder)).status_code == 403
    accepted = await client.post(accept_url, headers=author)
    responses = (await client.get(f"{POSTS_URL}/{post['id']}/responses", headers=author)).json()
    matched_post = (await client.get(f"{POSTS_URL}/{post['id']}")).json()

    assert accepted.json()["status"] == "accepted"
    assert sorted(r["status"] for r in responses) == ["accepted", "declined"]
    assert matched_post["status"] == "matched"
    assert matched_post["response_count"] == 1
    late = await respond(client, post["id"], await auth_headers(client))
    assert late.status_code == 409  # matched posts take no new responses


async def test_withdrawing_accepted_response_reopens_post(client: AsyncClient) -> None:
    author = await auth_headers(client)
    helper = await auth_headers(client)
    post = await create_post(client, author, category="help_wanted", reward_amount=None)
    response = (await respond(client, post["id"], helper, "I can help on Saturday")).json()
    await client.post(f"{POSTS_URL}/{post['id']}/responses/{response['id']}/accept", headers=author)

    withdraw = await client.delete(
        f"{POSTS_URL}/{post['id']}/responses/{response['id']}", headers=helper
    )
    reopened = (await client.get(f"{POSTS_URL}/{post['id']}")).json()

    assert withdraw.status_code == 204
    assert reopened["status"] == "open"
    assert reopened["response_count"] == 0


async def test_closed_and_expired_posts_are_hidden(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    closed = await create_post(client, headers, title="Closed post")
    expired = await create_post(client, headers, title="Expired post")
    visible = await create_post(client, headers, title="Visible post")
    await client.post(f"{POSTS_URL}/{closed['id']}/close", headers=headers)
    async with session_factory() as session:
        await session.execute(
            update(CommunityPost)
            .where(CommunityPost.id == expired["id"])
            .values(expires_at=utc_now() - timedelta(days=1))
        )
        await session.commit()

    default_ids = {p["id"] for p in (await client.get(POSTS_URL)).json()}
    closed_ids = {
        p["id"] for p in (await client.get(POSTS_URL, params={"status": "closed"})).json()
    }

    assert default_ids == {visible["id"]}
    assert closed_ids == {closed["id"]}
    assert (await respond(client, expired["id"], await auth_headers(client))).status_code == 409


async def test_my_posts_filter(client: AsyncClient) -> None:
    me = await register_user(client)
    mine = await create_post(client, bearer(me["tokens"]["access_token"]))
    await create_post(client, await auth_headers(client))

    posts = (await client.get(POSTS_URL, params={"owner_id": me["user"]["id"]})).json()

    assert [p["id"] for p in posts] == [mine["id"]]


async def test_validation(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    huge_details = {"notes": "x" * 3000}

    responses = [
        await client.post(POSTS_URL, json=post_data(reward_amount=-5), headers=headers),
        await client.post(POSTS_URL, json=post_data(details=huge_details), headers=headers),
        await client.post(POSTS_URL, json=post_data(category="weapons"), headers=headers),
        await client.post(
            POSTS_URL, json=post_data(location={"lat": 51.5, "lng": -0.12}), headers=headers
        ),
    ]

    assert [r.status_code for r in responses] == [422, 422, 422, 422]


@pytest.fixture
def fake_ai() -> Iterator[FakeConnector]:
    connector = FakeConnector()
    app.dependency_overrides[get_ai_connector] = lambda: connector
    yield connector
    app.dependency_overrides.pop(get_ai_connector, None)


async def test_ai_preview_needs_login_and_returns_draft(client: AsyncClient, fake_ai) -> None:
    text = {"text": "แมวสีขาวชื่อมะลิหายแถวซอย 12 ให้รางวัล 2000 บาท"}

    anonymous = await client.post(f"{POSTS_URL}/preview", json=text)
    draft = await client.post(f"{POSTS_URL}/preview", json=text, headers=await auth_headers(client))

    assert anonymous.status_code == 401
    assert draft.json()["category"] == "lost_pet"
    assert draft.json()["reward_amount"] == 2000
    assert fake_ai.calls and "มะลิ" in fake_ai.calls[0]


def test_parsed_post_coerces_bad_ai_values() -> None:
    parsed = ParsedPost.model_validate(
        {"title": "Help", "category": "Pet sitting", "reward_amount": "lots", "details": "cat"}
    )

    assert (parsed.category, parsed.reward_amount, parsed.details) == ("other", None, {})
