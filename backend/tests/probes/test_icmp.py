# icmplib ships no type stubs
# pyright: reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false
from unittest.mock import AsyncMock, patch

import pytest
from icmplib import Host, ICMPLibError

from uptime_city.probes.icmp import ping

ASYNC_PING = "uptime_city.probes.icmp.async_ping"


def fake_host(alive: bool, avg_rtt: float = 0.0) -> Host:
    return Host(address="10.0.0.1", packets_sent=1, rtts=[avg_rtt] if alive else [])


async def test_an_alive_host_is_a_success_with_its_round_trip_time() -> None:
    with patch(ASYNC_PING, AsyncMock(return_value=fake_host(True, 4.2))):
        result = await ping("srv", 5)
    assert result.success
    assert result.latency_ms == 4.2
    assert result.error is None


async def test_a_host_that_does_not_answer_is_a_failed_check() -> None:
    with patch(ASYNC_PING, AsyncMock(return_value=fake_host(False))):
        result = await ping("srv", 5)
    assert not result.success
    assert result.latency_ms is None
    assert result.error == "no reply"


async def test_an_icmp_error_is_a_failed_check_with_its_message() -> None:
    with patch(ASYNC_PING, AsyncMock(side_effect=ICMPLibError("name resolution failed"))):
        result = await ping("srv", 5)
    assert not result.success
    assert result.error == "name resolution failed"


@pytest.mark.parametrize(("timeout", "sent"), [(0.3, 1), (1, 1), (2.6, 3), (30, 30)])
async def test_the_timeout_is_rounded_to_whole_seconds_of_at_least_one(
    timeout: float, sent: int
) -> None:
    mock = AsyncMock(return_value=fake_host(True, 1.0))
    with patch(ASYNC_PING, mock):
        await ping("srv", timeout)
    mock.assert_awaited_once_with("srv", count=1, timeout=sent, privileged=False)
