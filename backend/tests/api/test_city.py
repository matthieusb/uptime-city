from tests.api.helpers import make_client


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
