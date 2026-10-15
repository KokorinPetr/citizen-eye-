import pytest
from httpx import AsyncClient


@pytest.mark.parametrize("path", ["/dev/map", "/dev/report", "/dev/assets/common.js"])
async def test_dev_pages_are_served(client: AsyncClient, path: str) -> None:
    response = await client.get(path)
    assert response.status_code == 200


@pytest.mark.parametrize("path", ["/dev/unknown", "/dev/assets/router.py"])
async def test_unknown_dev_files_are_not_served(client: AsyncClient, path: str) -> None:
    assert (await client.get(path)).status_code == 404
