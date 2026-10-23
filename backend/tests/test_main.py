from datetime import UTC, datetime

from fastapi.testclient import TestClient

from uptime_city.config.models import Config
from uptime_city.main import create_app
from uptime_city.probes.base import ProbeResult


async def ok_probe(hostname: str, timeout: float) -> ProbeResult:
    return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=2.0)


def make_client() -> TestClient:
    config = Config.model_validate(
        {
            "hosts": [
                {
                    "name": "Macro Server 1",
                    "url": "icmp://macro-server1",
                    "interval": "10ms",
                    "services": [{"name": "ssh", "url": "icmp://macro-server1", "interval": "5s"}],
                    "vm-hosts": [
                        {
                            "name": "Monitoring VM",
                            "url": "icmp://monitoring-vm",
                            "interval": "7s",
                            "services": [{"name": "web", "url": "icmp://monitoring-vm"}],
                        }
                    ],
                }
            ]
        }
    )
    return TestClient(create_app(config, ok_probe))


def test_health() -> None:
    with make_client() as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_endpoints() -> None:
    with make_client() as client:
        response = client.get("/api/v1/endpoints")
    assert response.json() == [
        {
            "id": "macro-server-1",
            "name": "Macro Server 1",
            "hostname": "macro-server1",
            "interval_s": 0.01,
            "host_id": None,
            "kind": "physical",
            "parent_id": None,
        },
        {
            "id": "macro-server-1-ssh",
            "name": "ssh",
            "hostname": "macro-server1",
            "interval_s": 5.0,
            "host_id": "macro-server-1",
            "kind": "service",
            "parent_id": None,
        },
        # A vm-host is listed like any host, so the views are unchanged.
        {
            "id": "monitoring-vm",
            "name": "Monitoring VM",
            "hostname": "monitoring-vm",
            "interval_s": 7.0,
            "host_id": None,
            "kind": "vm",
            "parent_id": "macro-server-1",
        },
        {
            "id": "monitoring-vm-web",
            "name": "web",
            "hostname": "monitoring-vm",
            "interval_s": 60.0,
            "host_id": "monitoring-vm",
            "kind": "service",
            "parent_id": None,
        },
    ]


def test_history_returns_results() -> None:
    with make_client() as client:
        while not client.get("/api/v1/endpoints/macro-server-1/history").json():
            pass
        results = client.get("/api/v1/endpoints/macro-server-1/history", params={"limit": 3}).json()
    assert 1 <= len(results) <= 3
    assert results[0]["success"] is True
    assert results[0]["host_down"] is False


def test_history_unknown_endpoint() -> None:
    with make_client() as client:
        assert client.get("/api/v1/endpoints/nope/history").status_code == 404


def test_host_summaries_count_the_services_up_and_down_of_each_physical_host() -> None:
    with make_client() as client:
        while not all(
            client.get(f"/api/v1/endpoints/{id}/history").json()
            for id in ("macro-server-1-ssh", "monitoring-vm-web")
        ):
            pass
        response = client.get("/api/v1/hosts/summary")
    # Its own service and the one of its vm-host, both up.
    assert response.json() == [{"id": "macro-server-1", "services_up": 2, "services_down": 0}]


def test_building_summaries_count_the_services_right_on_each_host() -> None:
    with make_client() as client:
        while not all(
            client.get(f"/api/v1/endpoints/{id}/history").json()
            for id in ("macro-server-1-ssh", "monitoring-vm-web")
        ):
            pass
        response = client.get("/api/v1/buildings/summary")
    # The physical host and its vm-host each have one service, both up.
    assert response.json() == [
        {"id": "macro-server-1", "services_up": 1, "services_down": 0},
        {"id": "monitoring-vm", "services_up": 1, "services_down": 0},
    ]
