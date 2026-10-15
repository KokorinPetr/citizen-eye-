import uuid
from datetime import timedelta

from httpx import AsyncClient

from app.core.security import TokenType, create_token
from tests.helpers import bearer

REGISTER_URL = "/auth/register"
LOGIN_URL = "/auth/login"
REFRESH_URL = "/auth/refresh"
LOGOUT_URL = "/auth/logout"
ME_URL = "/auth/me"

USER_DATA = {
    "email": "Volunteer@Example.com",
    "password": "strong-password-1",
    "full_name": "Somchai",
    "has_vehicle": True,
}


async def register_user(client: AsyncClient) -> dict:
    response = await client.post(REGISTER_URL, json=USER_DATA)
    assert response.status_code == 201, response.text
    return response.json()


async def test_register_returns_user_and_tokens(client: AsyncClient) -> None:
    body = await register_user(client)

    assert body["user"]["email"] == "volunteer@example.com"
    assert body["user"]["has_vehicle"] is True
    assert body["user"]["role"] == "user"
    assert "password_hash" not in body["user"]
    assert body["tokens"]["token_type"] == "bearer"
    assert body["tokens"]["access_token_expires_in"] == 15 * 60


async def test_register_rejects_duplicate_email_case_insensitive(client: AsyncClient) -> None:
    await register_user(client)

    response = await client.post(REGISTER_URL, json={**USER_DATA, "email": "VOLUNTEER@example.com"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_register_validates_input(client: AsyncClient) -> None:
    short_password = await client.post(REGISTER_URL, json={**USER_DATA, "password": "short"})
    bad_email = await client.post(REGISTER_URL, json={**USER_DATA, "email": "not-an-email"})

    assert short_password.status_code == 422
    assert bad_email.status_code == 422
    error = short_password.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"][0]["field"] == "body.password"


async def test_login_success(client: AsyncClient) -> None:
    await register_user(client)

    response = await client.post(
        LOGIN_URL, json={"email": "volunteer@example.com", "password": USER_DATA["password"]}
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "volunteer@example.com"


async def test_login_wrong_password_or_unknown_email(client: AsyncClient) -> None:
    await register_user(client)

    wrong_password = await client.post(
        LOGIN_URL, json={"email": USER_DATA["email"], "password": "wrong-password"}
    )
    unknown_email = await client.post(
        LOGIN_URL, json={"email": "nobody@example.com", "password": "whatever-123"}
    )

    for response in (wrong_password, unknown_email):
        assert response.status_code == 401
        assert response.json()["error"]["message"] == "Incorrect email or password"
        assert response.headers["www-authenticate"] == "Bearer"


async def test_me_requires_valid_access_token(client: AsyncClient) -> None:
    tokens = (await register_user(client))["tokens"]

    ok = await client.get(ME_URL, headers=bearer(tokens["access_token"]))
    no_token = await client.get(ME_URL)
    garbage = await client.get(ME_URL, headers=bearer("not-a-jwt"))
    refresh_as_access = await client.get(ME_URL, headers=bearer(tokens["refresh_token"]))

    assert ok.status_code == 200
    assert ok.json()["email"] == "volunteer@example.com"
    assert no_token.status_code == 401
    assert garbage.status_code == 401
    assert refresh_as_access.status_code == 401


async def test_expired_access_token_is_rejected(client: AsyncClient) -> None:
    user_id = uuid.UUID((await register_user(client))["user"]["id"])
    expired_token, _ = create_token(user_id, TokenType.ACCESS, timedelta(seconds=-1))

    response = await client.get(ME_URL, headers=bearer(expired_token))

    assert response.status_code == 401


async def test_refresh_rotates_tokens(client: AsyncClient) -> None:
    tokens = (await register_user(client))["tokens"]

    response = await client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})

    assert response.status_code == 200
    new_tokens = response.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]
    me = await client.get(ME_URL, headers=bearer(new_tokens["access_token"]))
    assert me.status_code == 200


async def test_reused_refresh_token_revokes_all_sessions(client: AsyncClient) -> None:
    old_tokens = (await register_user(client))["tokens"]
    rotated = await client.post(REFRESH_URL, json={"refresh_token": old_tokens["refresh_token"]})
    new_refresh_token = rotated.json()["refresh_token"]

    reuse = await client.post(REFRESH_URL, json={"refresh_token": old_tokens["refresh_token"]})
    after_reuse = await client.post(REFRESH_URL, json={"refresh_token": new_refresh_token})

    assert reuse.status_code == 401
    assert after_reuse.status_code == 401


async def test_refresh_rejects_access_token(client: AsyncClient) -> None:
    tokens = (await register_user(client))["tokens"]

    response = await client.post(REFRESH_URL, json={"refresh_token": tokens["access_token"]})

    assert response.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    tokens = (await register_user(client))["tokens"]

    logout = await client.post(LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]})
    refresh = await client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})

    assert logout.status_code == 204
    assert refresh.status_code == 401
