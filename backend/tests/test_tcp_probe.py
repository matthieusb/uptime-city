import asyncio
import socket
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from uptime_city.config.models import ClientConfig, Config, Endpoint, PhysicalHost
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import ProbeResult
from uptime_city.probes.tcp import connect

OPEN = "uptime_city.probes.tcp.asyncio.open_connection"


def fake_writer() -> MagicMock:
    writer = MagicMock()
    writer.wait_closed = AsyncMock()
    return writer


async def test_connect_success() -> None:
    mock = AsyncMock(return_value=(MagicMock(), fake_writer()))
    with patch(OPEN, mock):
        result = await connect("db", 5432, 1)
    mock.assert_awaited_once_with("db", 5432)
    assert result.success
    assert result.latency_ms is not None and result.latency_ms >= 0
    assert result.error is None


@pytest.mark.parametrize(
    "exc", [ConnectionRefusedError("refused"), socket.gaierror(-2, "Name or service not known")]
)
async def test_connect_failure(exc: OSError) -> None:
    with patch(OPEN, AsyncMock(side_effect=exc)):
        result = await connect("db", 5432, 1)
    assert not result.success
    assert result.latency_ms is None
    assert result.error


async def test_connect_timeout() -> None:
    async def hang(host: str, port: int) -> None:
        await asyncio.sleep(10)

    with patch(OPEN, hang):
        result = await connect("db", 5432, 0.01)
    assert not result.success
    assert result.error is not None and "timeout" in result.error


def test_tcp_endpoint_parsed() -> None:
    endpoint = Endpoint(name="pg", url="tcp://db.example.org:5432")
    assert (endpoint.scheme, endpoint.hostname, endpoint.port) == ("tcp", "db.example.org", 5432)


@pytest.mark.parametrize("url", ["tcp://", "tcp://host", "tcp://:5432", "tcp://host:abc"])
def test_tcp_url_requires_host_and_port(url: str) -> None:
    with pytest.raises(ValidationError):
        Endpoint(name="x", url=url)


async def test_monitor_dispatches_tcp_to_connect() -> None:
    async def icmp(hostname: str, timeout: float) -> ProbeResult:
        raise AssertionError("icmp probe must not be used")

    config = Config(
        hosts=[PhysicalHost(name="pg", url="tcp://db:5432", interval=timedelta(milliseconds=10))]
    )
    monitor = Monitor(config, icmp)
    mock = AsyncMock(return_value=(MagicMock(), fake_writer()))
    with patch(OPEN, mock):
        task = asyncio.create_task(monitor.run())
        await asyncio.sleep(0.05)
        task.cancel()
    assert monitor.history("pg")[0].success
    mock.assert_awaited_with("db", 5432)


async def test_monitor_gives_tcp_connect_the_timeout_of_its_endpoint() -> None:
    async def icmp(hostname: str, timeout: float) -> ProbeResult:
        raise AssertionError("icmp probe must not be used")

    config = Config(
        hosts=[
            PhysicalHost(
                name="pg",
                url="tcp://db:5432",
                interval=timedelta(milliseconds=10),
                client=ClientConfig(timeout=timedelta(seconds=25)),
            )
        ]
    )
    monitor = Monitor(config, icmp)
    connect_mock = AsyncMock(return_value=ProbeResult(ts=datetime.now(UTC), success=True))
    with patch("uptime_city.monitor.scheduler.connect", connect_mock):
        task = asyncio.create_task(monitor.run())
        await asyncio.sleep(0.05)
        task.cancel()
    connect_mock.assert_awaited_with("db", 5432, 25)
