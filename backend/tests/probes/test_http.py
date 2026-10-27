from unittest.mock import patch

import httpx
import pytest
import respx

from tests.config.helpers import endpoint
from tests.probes.helpers import URL
from uptime_city.probes.http import probe_http


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


@respx.mock
async def test_a_url_httpx_cannot_parse_is_a_failed_check() -> None:
    # Valid for the config (it starts with http://), but httpx raises InvalidURL, not an HTTPError.
    bad = endpoint(url="http://[::1")
    result = await probe_http(bad)
    assert not result.success
    assert result.latency_ms is None
    assert result.error is not None
    assert "InvalidURL" in result.error


@pytest.mark.parametrize(("insecure", "verify"), [(True, False), (False, True)])
@respx.mock
async def test_insecure_turns_the_certificate_check_off(insecure: bool, verify: bool) -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))
    with patch("uptime_city.probes.http.httpx.AsyncClient", wraps=httpx.AsyncClient) as client:
        await probe_http(endpoint(client={"insecure": insecure}))
    assert client.call_args.kwargs["verify"] is verify


@respx.mock
async def test_the_certificate_is_checked_by_default() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200))
    with patch("uptime_city.probes.http.httpx.AsyncClient", wraps=httpx.AsyncClient) as client:
        await probe_http(endpoint())
    assert client.call_args.kwargs["verify"] is True


@respx.mock
async def test_redirects_are_not_followed() -> None:
    target = "https://service.test/elsewhere"
    route = respx.get(URL).mock(return_value=httpx.Response(302, headers={"Location": target}))
    followed = respx.get(target).mock(return_value=httpx.Response(200))

    result = await probe_http(endpoint())
    assert not result.success
    assert result.error == "condition failed: [STATUS] == 200 (status=302)"
    assert route.call_count == 1
    assert not followed.called

    assert (await probe_http(endpoint(conditions=["[STATUS] < 400"]))).success


@respx.mock
async def test_several_failing_conditions_are_all_reported() -> None:
    respx.get(URL).mock(return_value=httpx.Response(503))
    result = await probe_http(
        endpoint(conditions=["[STATUS] == 200", "[RESPONSE_TIME] < 0", "[STATUS] < 500"])
    )
    assert result.error == (
        "condition failed: [STATUS] == 200 (status=503); "
        "condition failed: [RESPONSE_TIME] < 0 (status=503); "
        "condition failed: [STATUS] < 500 (status=503)"
    )


@respx.mock
async def test_latency_is_kept_when_a_condition_fails() -> None:
    respx.get(URL).mock(return_value=httpx.Response(500))
    result = await probe_http(endpoint())
    assert not result.success
    assert result.latency_ms is not None and result.latency_ms >= 0
