from datetime import timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import update

from app.core.base_model import utc_now
from app.core.database import session_factory
from app.modules.auth.enums import UserRole
from app.modules.feed.models import FeedPost
from tests.helpers import auth_headers

POSTS_URL = "/feed/posts"
COMMENTS_URL = "/feed/comments"


async def create_post(client: AsyncClient, headers: dict, **overrides: Any) -> dict:
    data = {
        "topic": "complaint",
        "body": "The drain on Soi 5 has been blocked for a week.",
        "area_text": "Lat Phrao",
        **overrides,
    }
    response = await client.post(POSTS_URL, json=data, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def comment(
    client: AsyncClient, post_id: str, headers: dict, body: str = "Same here!", **extra: Any
) -> dict:
    response = await client.post(
        f"{POSTS_URL}/{post_id}/comments", json={"body": body, **extra}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_anyone_reads_only_users_write(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    post = await create_post(client, headers)
    await comment(client, post["id"], headers)

    listed = (await client.get(POSTS_URL)).json()
    assert [p["id"] for p in listed] == [post["id"]]
    assert listed[0]["comment_count"] == 1
    assert listed[0]["liked_by_me"] is False
    assert len((await client.get(f"{POSTS_URL}/{post['id']}/comments")).json()) == 1

    no_login = await client.post(POSTS_URL, json={"topic": "chat", "body": "hello"})
    assert no_login.status_code == 401
    no_login = await client.post(f"{POSTS_URL}/{post['id']}/comments", json={"body": "hi"})
    assert no_login.status_code == 401
    assert (await client.post(f"{POSTS_URL}/{post['id']}/like")).status_code == 401


async def test_like_is_one_per_user_and_can_be_undone(client: AsyncClient) -> None:
    author = await auth_headers(client)
    fan = await auth_headers(client)
    post = await create_post(client, author)
    like_url = f"{POSTS_URL}/{post['id']}/like"

    assert (await client.post(like_url, headers=fan)).json() == {"liked": True, "like_count": 1}
    assert (await client.post(like_url, headers=fan)).json() == {"liked": True, "like_count": 1}
    assert (await client.post(like_url, headers=author)).json()["like_count"] == 2

    mine = (await client.get(f"{POSTS_URL}/{post['id']}", headers=fan)).json()
    assert mine["liked_by_me"] is True and mine["like_count"] == 2

    assert (await client.delete(like_url, headers=fan)).json() == {"liked": False, "like_count": 1}
    assert (await client.delete(like_url, headers=fan)).json()["like_count"] == 1


async def test_comment_likes(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    post = await create_post(client, headers)
    first = await comment(client, post["id"], headers)

    liked = await client.post(f"{COMMENTS_URL}/{first['id']}/like", headers=headers)
    assert liked.json() == {"liked": True, "like_count": 1}
    comments = (await client.get(f"{POSTS_URL}/{post['id']}/comments", headers=headers)).json()
    assert comments[0]["liked_by_me"] is True


async def test_replies_are_one_level_deep(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    post = await create_post(client, headers)
    top = await comment(client, post["id"], headers, "Top comment")
    reply = await comment(client, post["id"], headers, "Reply", parent_id=top["id"])
    reply_to_reply = await comment(client, post["id"], headers, "Reply 2", parent_id=reply["id"])

    assert reply["parent_id"] == top["id"]
    assert reply_to_reply["parent_id"] == top["id"]  # joins the same thread

    other_post = await create_post(client, headers)
    wrong_post = await client.post(
        f"{POSTS_URL}/{other_post['id']}/comments",
        json={"body": "x", "parent_id": top["id"]},
        headers=headers,
    )
    assert wrong_post.status_code == 404


async def test_deleting_a_comment_removes_replies_and_updates_count(client: AsyncClient) -> None:
    author = await auth_headers(client)
    other = await auth_headers(client)
    post = await create_post(client, author)
    top = await comment(client, post["id"], author)
    await comment(client, post["id"], other, "Reply", parent_id=top["id"])

    assert (await client.delete(f"{COMMENTS_URL}/{top['id']}", headers=other)).status_code == 403
    assert (await client.delete(f"{COMMENTS_URL}/{top['id']}", headers=author)).status_code == 204
    assert (await client.get(f"{POSTS_URL}/{post['id']}/comments")).json() == []
    assert (await client.get(f"{POSTS_URL}/{post['id']}")).json()["comment_count"] == 0


async def test_only_author_or_coordinator_deletes_post(client: AsyncClient) -> None:
    author = await auth_headers(client)
    stranger = await auth_headers(client)
    coordinator = await auth_headers(client, UserRole.COORDINATOR)
    first = await create_post(client, author)
    second = await create_post(client, author)

    assert (await client.delete(f"{POSTS_URL}/{first['id']}", headers=stranger)).status_code == 403
    assert (await client.delete(f"{POSTS_URL}/{first['id']}", headers=author)).status_code == 204
    deleted = await client.delete(f"{POSTS_URL}/{second['id']}", headers=coordinator)
    assert deleted.status_code == 204
    assert (await client.get(f"{POSTS_URL}/{first['id']}")).status_code == 404


async def test_three_reports_hide_a_post(client: AsyncClient) -> None:
    author = await auth_headers(client)
    post = await create_post(client, author)
    report_url = f"{POSTS_URL}/{post['id']}/report"

    first_reporter = await auth_headers(client)
    for _ in range(3):  # the same person reporting again counts once
        assert (await client.post(report_url, headers=first_reporter)).status_code == 204
    assert len((await client.get(POSTS_URL)).json()) == 1

    for _ in range(2):
        reporter = await auth_headers(client)
        assert (await client.post(report_url, headers=reporter)).status_code == 204
    assert (await client.get(POSTS_URL)).json() == []
    assert (await client.get(f"{POSTS_URL}/{post['id']}")).status_code == 404
    # The author still sees it (so they understand what happened).
    assert (await client.get(f"{POSTS_URL}/{post['id']}", headers=author)).status_code == 200


async def test_hidden_comment_drops_out_with_its_replies(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    post = await create_post(client, headers)
    top = await comment(client, post["id"], headers)
    await comment(client, post["id"], headers, "Reply", parent_id=top["id"])
    kept = await comment(client, post["id"], headers, "Fine comment")

    for _ in range(3):
        reporter = await auth_headers(client)
        await client.post(f"{COMMENTS_URL}/{top['id']}/report", headers=reporter)

    comments = (await client.get(f"{POSTS_URL}/{post['id']}/comments")).json()
    assert [c["id"] for c in comments] == [kept["id"]]


async def test_my_posts_include_my_hidden_ones(client: AsyncClient) -> None:
    me = await auth_headers(client)
    my_id = (await client.get("/auth/me", headers=me)).json()["id"]
    other = await auth_headers(client)
    mine = await create_post(client, me)
    hidden = await create_post(client, me, body="This one got reported")
    await create_post(client, other)
    for _ in range(3):
        reporter = await auth_headers(client)
        await client.post(f"{POSTS_URL}/{hidden['id']}/report", headers=reporter)

    params = {"author_id": my_id}
    own = (await client.get(POSTS_URL, params=params, headers=me)).json()
    assert {p["id"] for p in own} == {mine["id"], hidden["id"]}
    public = (await client.get(POSTS_URL, params=params)).json()
    assert [p["id"] for p in public] == [mine["id"]]


async def test_filter_by_topic_and_sort_by_popular(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    quiet = await create_post(client, headers, topic="question", body="Where is the market?")
    popular = await create_post(client, headers, topic="complaint")
    old = await create_post(client, headers, topic="complaint", body="Old but liked a lot")
    for _ in range(2):
        await client.post(f"{POSTS_URL}/{popular['id']}/like", headers=await auth_headers(client))
    async with session_factory() as session:
        await session.execute(
            update(FeedPost)
            .where(FeedPost.id == old["id"])
            .values(created_at=utc_now() - timedelta(days=30), like_count=99)
        )
        await session.commit()

    questions = (await client.get(POSTS_URL, params={"topic": "question"})).json()
    assert [p["id"] for p in questions] == [quiet["id"]]

    top = (await client.get(POSTS_URL, params={"sort": "top"})).json()
    assert [p["id"] for p in top] == [popular["id"], quiet["id"]]  # older than 7 days: left out

    newest_first = (await client.get(POSTS_URL, params={"limit": 2})).json()
    assert [p["id"] for p in newest_first] == [popular["id"], quiet["id"]]
    next_page = (await client.get(POSTS_URL, params={"limit": 2, "offset": 2})).json()
    assert [p["id"] for p in next_page] == [old["id"]]
