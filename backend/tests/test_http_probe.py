import asyncio

import httpx
import pytest
import respx
from pydantic import ValidationError

from uptime_city.config.models import Config, Endpoint, PhysicalHost
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import ProbeResult
from uptime_city.probes.http import probe_http

URL = "https://service.test/health"


def endpoint(**kwargs: object) -> Endpoint:
    data: dict[str, object] = {"name": "svc", "url": URL, "conditions": ["[STATUS] == 200"]}
    data.update(kwargs)
    return Endpoint.model_validate(data)


@respx.mock
async def test_status_condition_passes() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))
    result = await probe_http(endpoint())
    assert result.success
    assert result.error is None
    assert result.latency_ms is not None


@respx.mock
async def test_status_condition_fails() -> None:
    respx.get(URL).mock(return_value=httpx.Response(503))
    result = await probe_http(endpoint())
    assert not result.success
    assert result.error == "condition failed: [STATUS] == 200 (status=503)"


@respx.mock
async def test_not_equal_operator() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))
    assert (await probe_http(endpoint(conditions=["[STATUS] != 500"]))).success


@respx.mock
async def test_response_time_condition() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))
    assert (
        await probe_http(endpoint(conditions=["[STATUS] == 200", "[RESPONSE_TIME] < 5000"]))
    ).success
    assert not (
        await probe_http(endpoint(conditions=["[STATUS] == 200", "[RESPONSE_TIME] < 0"]))
    ).success


@respx.mock
async def test_method_headers_body() -> None:
    route = respx.post(URL).mock(return_value=httpx.Response(200))
    result = await probe_http(endpoint(method="POST", headers={"X-Test": "1"}, body="hello"))
    assert result.success
    sent = route.calls.last.request
    assert sent.headers["X-Test"] == "1"
    assert sent.content == b"hello"


@respx.mock
async def test_request_error_is_failed_check() -> None:
    respx.get(URL).mock(side_effect=httpx.ConnectError("boom"))
    result = await probe_http(endpoint())
    assert not result.success
    assert result.latency_ms is None
    assert result.error is not None
    assert "boom" in result.error


@respx.mock
async def test_timeout_is_failed_check() -> None:
    respx.get(URL).mock(side_effect=httpx.ReadTimeout("slow"))
    result = await probe_http(endpoint(client={"timeout": "1s"}))
    assert not result.success
    assert result.error


@respx.mock
async def test_unsupported_condition_is_failed_check() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))
    result = await probe_http(endpoint(conditions=["[STATUS] == 200", "nonsense"]))
    assert not result.success
    assert result.error is not None
    assert "nonsense" in result.error


def test_endpoint_defaults_and_validation() -> None:
    e = endpoint()
    assert e.method == "GET"
    assert e.client.timeout.total_seconds() == 10
    assert not e.client.insecure
    with pytest.raises(ValidationError):
        endpoint(url="ftp://x")


@respx.mock
async def test_monitor_dispatches_http_endpoints() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))

    async def icmp(hostname: str, timeout: float) -> ProbeResult:
        raise AssertionError("icmp probe must not be used for http endpoints")

    http_endpoint = PhysicalHost.model_validate(
        {"name": "svc", "url": URL, "interval": "10ms", "conditions": ["[STATUS] == 200"]}
    )
    monitor = Monitor(Config(hosts=[http_endpoint]), icmp)
    task = asyncio.create_task(monitor.run())
    while not monitor.history(http_endpoint.id):
        await asyncio.sleep(0.01)
    task.cancel()
    assert monitor.history(http_endpoint.id)[0].success
