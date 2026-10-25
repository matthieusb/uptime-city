from tests.helpers import make_client


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
