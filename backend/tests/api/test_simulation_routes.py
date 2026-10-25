import pytest
from fastapi.testclient import TestClient

from tests.helpers import make_client


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


@pytest.mark.parametrize("count", ["0", "-1", "abc"])
def test_actions_refuse_a_count_below_one(count: str) -> None:
    with make_client(simulate=True) as client:
        response = client.post("/api/v1/simulation/actions/down-services", params={"count": count})
    assert response.status_code == 422
