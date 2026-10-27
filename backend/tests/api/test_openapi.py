import pytest

from tests.api.helpers import make_client

# The implemented routes of the contract in the root CLAUDE.md (no /status or /events yet).
ROUTES = {
    ("get", "/api/v1/health"),
    ("get", "/api/v1/info"),
    ("get", "/api/v1/city"),
    ("post", "/api/v1/city/regenerate"),
    ("get", "/api/v1/planet"),
    ("post", "/api/v1/planet/regenerate"),
    ("get", "/api/v1/endpoints"),
    ("get", "/api/v1/endpoints/{endpoint_id}/history"),
    ("post", "/api/v1/simulation/refresh"),
    ("post", "/api/v1/simulation/start"),
    ("post", "/api/v1/simulation/stop"),
    ("post", "/api/v1/simulation/actions/{action}"),
}


def test_the_openapi_spec_lists_every_route_of_the_contract() -> None:
    with make_client() as client:
        paths = client.get("/openapi.json").json()["paths"]
    listed = {(method, path) for path, methods in paths.items() for method in methods}
    assert listed == ROUTES


@pytest.mark.parametrize("action", ["reset", "nuke-host", "demolish-vm", "down-services"])
def test_the_openapi_spec_lists_the_simulation_actions(action: str) -> None:
    with make_client() as client:
        spec = client.get("/openapi.json").json()
    parameters = spec["paths"]["/api/v1/simulation/actions/{action}"]["post"]["parameters"]
    (path_parameter,) = (parameter for parameter in parameters if parameter["name"] == "action")
    assert action in path_parameter["schema"]["enum"]
