from pathlib import Path

import pytest
from pydantic import ValidationError

from tests.config.helpers import endpoint, write
from uptime_city.config.loader import load_config
from uptime_city.config.models import Endpoint


def test_host_can_use_any_check(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: web
            url: https://example.org
            conditions: ["[STATUS] == 200"]
        """,
    )
    (host,) = load_config(path).hosts
    assert host.is_http


def test_endpoint_rejects_unsupported_scheme(tmp_path: Path) -> None:
    path = write(tmp_path, "hosts:\n  - {name: web, url: 'ftp://example.org', interval: 30s}\n")
    with pytest.raises(ValidationError):
        load_config(path)


@pytest.mark.parametrize(
    "hosts",
    [
        "- {name: web, url: 'https://example.org'}",
        "- {name: web, url: 'http://example.org', conditions: ['[RESPONSE_TIME] < 500']}",
        "- name: srv\n    url: icmp://srv\n    services:\n      - {name: web, url: 'https://example.org'}",
    ],
)
def test_http_endpoint_requires_a_status_condition(tmp_path: Path, hosts: str) -> None:
    path = write(tmp_path, f"hosts:\n  {hosts}\n")
    with pytest.raises(ValidationError, match=r"\[STATUS\]"):
        load_config(path)


def test_status_condition_is_only_required_for_http(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: srv
            url: icmp://srv
            services:
              - {name: db, url: 'tcp://srv:5432'}
              - {name: web, url: 'https://example.org', conditions: ['[STATUS] == 200']}
        """,
    )
    (host,) = load_config(path).hosts
    assert [service.name for service in host.services] == ["db", "web"]


def test_tcp_endpoint_parsed() -> None:
    endpoint = Endpoint(name="pg", url="tcp://db.example.org:5432")
    assert (endpoint.scheme, endpoint.hostname, endpoint.port) == ("tcp", "db.example.org", 5432)


@pytest.mark.parametrize("url", ["tcp://", "tcp://host", "tcp://:5432", "tcp://host:abc"])
def test_tcp_url_requires_host_and_port(url: str) -> None:
    with pytest.raises(ValidationError):
        Endpoint(name="x", url=url)


def test_endpoint_defaults_and_validation() -> None:
    parsed = endpoint()
    assert parsed.method == "GET"
    assert parsed.client.timeout.total_seconds() == 30
    assert not parsed.client.insecure
    with pytest.raises(ValidationError):
        endpoint(url="ftp://x")


@pytest.mark.parametrize("raw", ["0s", "0ms", "0m", "0.0s"])
def test_interval_must_be_positive(raw: str) -> None:
    with pytest.raises(ValidationError, match="positive"):
        endpoint(interval=raw)


@pytest.mark.parametrize("raw", ["0s", "0ms", "0h"])
def test_client_timeout_must_be_positive(raw: str) -> None:
    with pytest.raises(ValidationError, match="positive"):
        endpoint(client={"timeout": raw})


def test_positive_interval_and_timeout_are_accepted() -> None:
    parsed = endpoint(interval="1ms", client={"timeout": "0.5s"})
    assert parsed.interval.total_seconds() == 0.001
    assert parsed.client.timeout.total_seconds() == 0.5


def test_tcp_port_cannot_exceed_65535() -> None:
    assert Endpoint(name="ok", url="tcp://db:65535").port == 65535
    with pytest.raises(ValidationError):
        Endpoint(name="x", url="tcp://db:65536")


@pytest.mark.xfail(
    strict=True, reason="a name without letters or digits gives an empty id and is accepted"
)
@pytest.mark.parametrize("name", ["!!!", "---", "   ", ""])
def test_a_name_without_alphanumerics_is_rejected(name: str) -> None:
    with pytest.raises(ValidationError):
        Endpoint(name=name, url="icmp://a")
