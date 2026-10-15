from httpx import AsyncClient

from tests.helpers import auth_headers, create_incident

LAT_PHRAO = {"lat": 13.8167, "lng": 100.5612}
NEAR_LAT_PHRAO = {"lat": 13.8257, "lng": 100.5612}  # ~1 km away
CHIANG_MAI = {"lat": 18.7883, "lng": 98.9853}


async def test_no_alert_when_nothing_urgent_nearby(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    await create_incident(client, headers, urgency="low")  # nearby but not urgent
    await create_incident(client, headers, urgency="critical", location=CHIANG_MAI)  # far

    alert = (await client.get("/alerts", params=NEAR_LAT_PHRAO)).json()

    assert alert == {"active": False, "radius_m": 5000, "message": None, "incidents": []}


async def test_alert_for_urgent_incident_nearby(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    incident = await create_incident(client, headers, urgency="critical", location=LAT_PHRAO)

    alert = (await client.get("/alerts", params=NEAR_LAT_PHRAO)).json()

    assert alert["active"] is True
    assert alert["incidents"][0]["id"] == incident["id"]
    assert 950 < alert["incidents"][0]["distance_m"] < 1050
    assert "Emergency nearby" in alert["message"]


async def test_resolved_incidents_do_not_alert(client: AsyncClient) -> None:
    headers = await auth_headers(client)
    incident = await create_incident(client, headers, urgency="critical", location=LAT_PHRAO)
    await client.post(f"/incidents/{incident['id']}/resolve", headers=headers)

    assert (await client.get("/alerts", params=LAT_PHRAO)).json()["active"] is False
