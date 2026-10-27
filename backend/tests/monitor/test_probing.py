import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import respx

from tests.monitor.helpers import (
    TICK,
    Probes,
    make_config,
    make_config_with_service,
    running,
    until,
)
from tests.probes.helpers import OPEN, URL, fake_writer
from uptime_city.config.models import (
    ClientConfig,
    Config,
    PhysicalHost,
    Service,
)
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import ProbeResult


async def test_monitor_records_probe_failure() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=False, error="unreachable")

    monitor = Monitor(make_config(), probe)
    task = asyncio.create_task(monitor.run())
    while not monitor.history("srv"):
        await asyncio.sleep(0.01)
    task.cancel()

    assert monitor.history("srv")[0].error == "unreachable"


async def test_monitor_probes_services() -> None:
    probed: list[str] = []

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        probed.append(hostname)
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    monitor = Monitor(make_config_with_service(), probe)
    task = asyncio.create_task(monitor.run())
    while not monitor.history("srv-app"):
        await asyncio.sleep(0.01)
    task.cancel()

    assert "app" in probed
    assert monitor.history("srv-app")[-1].host_down is False


async def test_monitor_gives_each_probe_the_timeout_of_its_endpoint() -> None:
    timeouts: dict[str, float] = {}

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        timeouts[hostname] = timeout
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    config = Config(
        hosts=[
            PhysicalHost(
                name="srv",
                url="icmp://srv",
                interval=TICK,
                services=[
                    Service(
                        name="app",
                        url="icmp://app",
                        interval=TICK,
                        client=ClientConfig(timeout=timedelta(seconds=12)),
                    ),
                    Service(name="other", url="icmp://other", interval=TICK),
                ],
            )
        ]
    )
    monitor = Monitor(config, probe)
    task = asyncio.create_task(monitor.run())
    while len(timeouts) < 3:
        await asyncio.sleep(0.01)
    task.cancel()

    assert timeouts == {"srv": 30, "app": 12, "other": 30}


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


async def test_a_probe_that_raises_is_a_failed_check_and_does_not_stop_the_monitor() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        if hostname == "bad":
            raise RuntimeError("probe blew up")
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    config = Config(
        hosts=[
            PhysicalHost(name="bad", url="icmp://bad", interval=TICK),
            PhysicalHost(name="good", url="icmp://good", interval=TICK),
        ]
    )
    monitor = Monitor(config, probe)
    task = asyncio.create_task(monitor.run())
    async with asyncio.timeout(5):
        while not task.done() and (
            len(monitor.history("bad")) < 3 or len(monitor.history("good")) < 3
        ):
            await asyncio.sleep(0.01)
    assert not task.done()
    task.cancel()

    failed = monitor.history("bad")[-1]
    assert failed.success is False
    assert failed.error is not None
    assert "RuntimeError" in failed.error and "probe blew up" in failed.error
    assert all(result.success for result in monitor.history("good"))


async def test_each_loop_waits_the_interval_of_its_endpoint(sleeps: list[float]) -> None:
    config = Config(
        hosts=[
            PhysicalHost(name="a", url="icmp://a", interval=timedelta(seconds=3)),
            PhysicalHost(name="b", url="icmp://b", interval=timedelta(seconds=7)),
        ]
    )
    async with running(Monitor(config, Probes())):
        await until(lambda: len(sleeps) >= 6)
    assert set(sleeps) == {3.0, 7.0}
