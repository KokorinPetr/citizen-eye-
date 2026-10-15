import pytest

from app.core.config import to_asyncpg_url


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        (  # Neon, as shown in its dashboard
            "postgresql://user:p%40ss@ep-cool-1.eu-central-1.aws.neon.tech/civic?sslmode=require&channel_binding=require",
            "postgresql+asyncpg://user:p%40ss@ep-cool-1.eu-central-1.aws.neon.tech/civic?ssl=require",
        ),
        (  # Heroku/Render style scheme
            "postgres://user:pw@host:5432/db",
            "postgresql+asyncpg://user:pw@host:5432/db",
        ),
        (  # local URL is unchanged
            "postgresql+asyncpg://civic_eye:civic_eye@localhost:5432/civic_eye",
            "postgresql+asyncpg://civic_eye:civic_eye@localhost:5432/civic_eye",
        ),
        (
            "postgresql://u:p@h/db?sslmode=disable",
            "postgresql+asyncpg://u:p@h/db",
        ),
    ],
)
def test_database_url_is_normalized_for_asyncpg(given: str, expected: str) -> None:
    assert to_asyncpg_url(given) == expected
