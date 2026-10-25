import pytest

from tests.helpers import make_client


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


@pytest.mark.parametrize("limit", ["0", "-1", "51", "abc"])
def test_history_refuses_a_limit_out_of_range(limit: str) -> None:
    with make_client(simulate=True) as client:
        response = client.get("/api/v1/endpoints/macro-server-1/history", params={"limit": limit})
    assert response.status_code == 422


def test_history_limit_keeps_only_the_last_results() -> None:
    with make_client(simulate=True) as client:
        for _ in range(3):
            client.post("/api/v1/simulation/refresh")
        everything = client.get("/api/v1/endpoints/macro-server-1/history").json()
        last = client.get("/api/v1/endpoints/macro-server-1/history", params={"limit": 1}).json()
        most = client.get("/api/v1/endpoints/macro-server-1/history", params={"limit": 50}).json()
    assert len(everything) == 4
    assert last == everything[-1:]
    assert most == everything
