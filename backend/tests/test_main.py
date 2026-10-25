import asyncio
import time
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from uptime_city.config.models import Config, StorageConfig
from uptime_city.main import create_app, parse_args
from uptime_city.probes.base import ProbeResult
from uptime_city.storage.database import Database


async def ok_probe(hostname: str, timeout: float) -> ProbeResult:
    return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=2.0)


def make_client(
    simulate: bool = False,
    lab_name: str | None = None,
    storage: dict[str, str] | None = None,
) -> TestClient:
    config = Config.model_validate(
        {
            "storage": storage or {"type": "memory"},
            **({"lab-name": lab_name} if lab_name else {}),
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
            ],
        }
    )
    return TestClient(create_app(config, ok_probe, simulate))


def test_info_tells_whether_the_backend_simulates() -> None:
    with make_client() as client:
        assert client.get("/api/v1/info").json() == {
            "simulation": False,
            "simulation_running": False,
            "next_refresh_in_s": None,
            "lab_name": "lab-map",
        }
    with make_client(simulate=True) as client:
        body = client.get("/api/v1/info").json()
        assert body["simulation"] is True
        assert 0 <= body["next_refresh_in_s"] <= 30


def test_info_gives_the_lab_name_of_the_config() -> None:
    with make_client(lab_name="Home lab") as client:
        assert client.get("/api/v1/info").json()["lab_name"] == "Home lab"


def test_refresh_simulation_redraws_now_and_restarts_the_countdown() -> None:
    with make_client(simulate=True) as client:
        client.post("/api/v1/simulation/start")
        before = len(client.get("/api/v1/endpoints/macro-server-1/history").json())
        response = client.post("/api/v1/simulation/refresh")
        assert response.status_code == 200
        assert response.json()["simulation"] is True
        assert response.json()["next_refresh_in_s"] > 29
        after = len(client.get("/api/v1/endpoints/macro-server-1/history").json())
        assert after >= before + 1


def test_the_simulation_is_stopped_at_first_with_a_full_countdown() -> None:
    with make_client(simulate=True) as client:
        body = client.get("/api/v1/info").json()
        assert body["simulation_running"] is False
        assert body["next_refresh_in_s"] == 30


def test_start_and_stop_the_simulation() -> None:
    with make_client(simulate=True) as client:
        started = client.post("/api/v1/simulation/start")
        assert started.status_code == 200
        assert started.json()["simulation_running"] is True
        assert started.json()["next_refresh_in_s"] > 29
        assert client.get("/api/v1/info").json()["simulation_running"] is True
        stopped = client.post("/api/v1/simulation/stop")
        assert stopped.status_code == 200
        assert stopped.json()["simulation_running"] is False
        assert stopped.json()["next_refresh_in_s"] == 30
        assert client.get("/api/v1/info").json()["simulation_running"] is False


def test_refresh_simulation_redraws_a_stopped_simulation_without_starting_it() -> None:
    with make_client(simulate=True) as client:
        before = len(client.get("/api/v1/endpoints/macro-server-1/history").json())
        response = client.post("/api/v1/simulation/refresh")
        assert response.json()["simulation_running"] is False
        assert response.json()["next_refresh_in_s"] == 30
        after = len(client.get("/api/v1/endpoints/macro-server-1/history").json())
        assert after >= before + 1


def test_start_and_stop_are_refused_when_not_simulating() -> None:
    with make_client() as client:
        assert client.post("/api/v1/simulation/start").status_code == 404
        assert client.post("/api/v1/simulation/stop").status_code == 404


def history_sizes(client: TestClient) -> dict[str, int]:
    return {
        id: len(client.get(f"/api/v1/endpoints/{id}/history").json())
        for id in ("macro-server-1", "macro-server-1-ssh")
    }


def test_actions_change_the_stopped_simulation_by_hand() -> None:
    with make_client(simulate=True) as client:
        before = history_sizes(client)
        response = client.post("/api/v1/simulation/actions/nuke-host")
        assert response.status_code == 200
        assert response.json()["simulation_running"] is False
        history = client.get("/api/v1/endpoints/macro-server-1/history").json()
        assert history[-1]["success"] is False
        assert history_sizes(client)["macro-server-1"] == before["macro-server-1"] + 1
        client.post("/api/v1/simulation/actions/reset")
        history = client.get("/api/v1/endpoints/macro-server-1/history").json()
        assert history[-1]["success"] is True


def test_actions_take_a_count() -> None:
    with make_client(simulate=True) as client:
        client.post("/api/v1/simulation/actions/reset")
        assert client.post("/api/v1/simulation/actions/down-services?count=2").status_code == 200
        downs = [
            client.get(f"/api/v1/endpoints/{id}/history").json()[-1]["success"]
            for id in ("macro-server-1-ssh", "monitoring-vm-web")
        ]
        assert downs == [False, False]
        assert client.post("/api/v1/simulation/actions/down-services?count=0").status_code == 422


def test_actions_are_refused_for_an_unknown_action() -> None:
    with make_client(simulate=True) as client:
        assert client.post("/api/v1/simulation/actions/explode").status_code == 422


def test_actions_are_refused_while_the_simulation_runs() -> None:
    with make_client(simulate=True) as client:
        client.post("/api/v1/simulation/start")
        assert client.post("/api/v1/simulation/actions/reset").status_code == 409


def test_actions_are_refused_when_not_simulating() -> None:
    with make_client() as client:
        assert client.post("/api/v1/simulation/actions/reset").status_code == 404


def test_refresh_simulation_is_refused_when_not_simulating() -> None:
    with make_client() as client:
        assert client.post("/api/v1/simulation/refresh").status_code == 404


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


def test_city_seed_is_empty_until_regenerated() -> None:
    with make_client() as client:
        assert client.get("/api/v1/city").json() == {"seed": ""}


def test_regenerating_the_city_gives_and_keeps_a_new_seed() -> None:
    with make_client() as client:
        first = client.post("/api/v1/city/regenerate").json()["seed"]
        assert first != ""
        assert client.get("/api/v1/city").json() == {"seed": first}
        second = client.post("/api/v1/city/regenerate").json()["seed"]
        assert second not in {"", first}
        assert client.get("/api/v1/city").json() == {"seed": second}


def test_the_city_seed_is_kept_across_restarts(tmp_path: Path) -> None:
    storage = {"type": "sqlite", "path": str(tmp_path / "uptime.db")}
    with make_client(storage=storage) as client:
        seed = client.post("/api/v1/city/regenerate").json()["seed"]
    with make_client(storage=storage) as client:
        assert client.get("/api/v1/city").json() == {"seed": seed}


def test_the_history_is_kept_across_restarts(tmp_path: Path) -> None:
    storage = {"type": "sqlite", "path": str(tmp_path / "uptime.db")}
    with make_client(storage=storage) as client:
        while len(client.get("/api/v1/endpoints/macro-server-1/history").json()) < 3:
            time.sleep(0.01)
    restarted = datetime.now(UTC)
    with make_client(storage=storage) as client:
        history: list[dict[str, str]] = []
        while not history:
            history = client.get("/api/v1/endpoints/macro-server-1/history").json()
            time.sleep(0.01)
    assert datetime.fromisoformat(history[0]["ts"]) < restarted


async def stored_results(storage: dict[str, str]) -> int:
    database = Database(StorageConfig.model_validate(storage))
    await database.init()
    count = len(await database.results.recent("macro-server-1", 50))
    await database.close()
    return count


def test_the_simulated_statuses_are_not_kept(tmp_path: Path) -> None:
    storage = {"type": "sqlite", "path": str(tmp_path / "uptime.db")}
    with make_client(simulate=True, storage=storage) as client:
        assert client.get("/api/v1/endpoints/macro-server-1/history").json()
    assert asyncio.run(stored_results(storage)) == 0


def test_server_listens_on_localhost_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("UPTIME_CITY_HOST", raising=False)
    monkeypatch.delenv("UPTIME_CITY_PORT", raising=False)
    args = parse_args([])
    assert (args.host, args.port) == ("127.0.0.1", 8000)


def test_server_address_can_be_set_by_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPTIME_CITY_HOST", "0.0.0.0")
    monkeypatch.setenv("UPTIME_CITY_PORT", "9000")
    args = parse_args([])
    assert (args.host, args.port) == ("0.0.0.0", 9000)


def test_server_address_flags_override_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPTIME_CITY_HOST", "0.0.0.0")
    args = parse_args(["--host", "10.0.0.5", "--port", "8123"])
    assert (args.host, args.port) == ("10.0.0.5", 8123)
