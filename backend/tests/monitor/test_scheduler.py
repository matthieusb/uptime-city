import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator, Callable
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from tests.helpers import OPEN, URL, fake_writer
from uptime_city.config.models import (
    ClientConfig,
    Config,
    PhysicalHost,
    Service,
    StorageConfig,
)
from uptime_city.monitor.scheduler import HISTORY_SIZE, PRUNE_EVERY_S, Monitor
from uptime_city.monitor.simulation import Simulation
from uptime_city.probes.base import ProbeResult
from uptime_city.storage.database import Database

TICK = timedelta(milliseconds=10)


def make_config() -> Config:
    return Config(hosts=[PhysicalHost(name="srv", url="icmp://srv", interval=TICK)])


def make_config_with_service() -> Config:
    return Config(
        hosts=[
            PhysicalHost(
                name="srv",
                url="icmp://srv",
                interval=TICK,
                services=[Service(name="app", url="icmp://app", interval=TICK)],
            )
        ]
    )


async def test_monitor_keeps_only_the_last_50_results() -> None:
    calls = 0

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        nonlocal calls
        calls += 1
        return ProbeResult(ts=datetime.now(UTC), success=calls % 2 == 0, latency_ms=1.0)

    monitor = Monitor(make_config(), probe)
    task = asyncio.create_task(monitor.run())
    while calls < 60:
        await asyncio.sleep(0.01)
    task.cancel()

    history = monitor.history("srv")
    assert len(history) == 50
    assert history[-1].ts >= history[0].ts


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


async def test_monitor_skips_services_when_host_is_down() -> None:
    probed: list[str] = []

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        probed.append(hostname)
        return ProbeResult(ts=datetime.now(UTC), success=hostname != "srv", error="unreachable")

    monitor = Monitor(make_config_with_service(), probe)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv-app")) < 3:
        await asyncio.sleep(0.01)
    task.cancel()

    # The service is probed at most once, before the host's first result lands.
    assert probed.count("app") <= 1
    last = monitor.history("srv-app")[-1]
    assert last.success is False
    assert last.host_down is True


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


async def memory_database() -> Database:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    return database


async def test_monitor_saves_every_result() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    database = await memory_database()
    monitor = Monitor(make_config(), probe, database=database)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 3:
        await asyncio.sleep(0.01)
    task.cancel()

    assert len(await database.results.recent("srv", 50)) >= 3
    await database.close()


async def test_monitor_starts_with_the_results_of_the_last_run() -> None:
    database = await memory_database()
    old = ProbeResult(ts=datetime.now(UTC) - timedelta(hours=2), success=False, error="late")
    await database.results.add("srv", old)

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    monitor = Monitor(make_config(), probe, database=database)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 2:
        await asyncio.sleep(0.01)
    task.cancel()

    history = monitor.history("srv")
    assert history[0] == old
    assert history[1].success is True
    await database.close()


async def test_monitor_drops_the_results_older_than_the_retention() -> None:
    database = await memory_database()
    await database.results.add(
        "srv", ProbeResult(ts=datetime.now(UTC) - timedelta(days=31), success=True)
    )
    recent = ProbeResult(ts=datetime.now(UTC) - timedelta(days=29), success=True)
    await database.results.add("srv", recent)

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    monitor = Monitor(make_config(), probe, database=database)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 2:
        await asyncio.sleep(0.01)
    task.cancel()

    assert monitor.history("srv")[0] == recent
    stored = await database.results.recent("srv", 50)
    assert all(r.ts > datetime.now(UTC) - timedelta(days=30) for r in stored)
    await database.close()


async def test_a_failing_database_does_not_stop_the_monitoring() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    # Once closed, a memory database comes back empty, without its tables: every query fails.
    broken = await memory_database()
    await broken.close()
    monitor = Monitor(make_config(), probe, database=broken)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 3:
        await asyncio.sleep(0.01)
    task.cancel()


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
    assert all(r.success for r in monitor.history("good"))


real_sleep = asyncio.sleep


@pytest.fixture
def sleeps(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """Replaces the scheduler's sleeps by a yield to the event loop, and records their delays."""
    delays: list[float] = []

    async def fake_sleep(delay: float, result: object = None) -> None:
        delays.append(delay)
        await real_sleep(0)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    return delays


async def until(condition: Callable[[], bool]) -> None:
    async with asyncio.timeout(5):
        while not condition():
            await real_sleep(0)


@contextlib.asynccontextmanager
async def running(monitor: Monitor) -> AsyncGenerator[asyncio.Task[None]]:
    task = asyncio.create_task(monitor.run())
    try:
        yield task
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def host_config(*, interval: str = "10ms") -> Config:
    """A physical host with a service, and a vm-host with a service."""
    return Config.model_validate(
        {
            "hosts": [
                {
                    "name": "srv",
                    "url": "icmp://srv",
                    "interval": interval,
                    "services": [{"name": "app", "url": "icmp://app", "interval": interval}],
                    "vm-hosts": [
                        {
                            "name": "vm",
                            "url": "icmp://vm",
                            "interval": interval,
                            "services": [
                                {"name": "web", "url": "icmp://web", "interval": interval}
                            ],
                        }
                    ],
                }
            ]
        }
    )


class Probes:
    """A probe whose hosts can be told to be down, and that remembers what it was asked."""

    def __init__(self) -> None:
        self.down: set[str] = set()
        self.asked: list[str] = []

    async def __call__(self, hostname: str, timeout: float) -> ProbeResult:
        self.asked.append(hostname)
        return ProbeResult(
            ts=datetime.now(UTC),
            success=hostname not in self.down,
            latency_ms=None if hostname in self.down else 1.0,
            error="unreachable" if hostname in self.down else None,
        )


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


async def test_the_prune_loop_runs_every_hour_and_survives_a_failing_prune(
    sleeps: list[float], caplog: pytest.LogCaptureFixture
) -> None:
    database = await memory_database()
    prune = AsyncMock(side_effect=[0, RuntimeError("disk full"), 0, 0])
    database.results.prune = prune  # one call at startup, then one per hour
    monitor = Monitor(make_config(), Probes(), database=database)
    with caplog.at_level(logging.ERROR, logger="uptime_city.monitor.scheduler"):
        async with running(monitor) as task:
            await until(lambda: prune.await_count >= 4)
            assert not task.done()
    assert sleeps.count(PRUNE_EVERY_S) >= 3
    assert "could not delete the results past the retention" in caplog.text
    await database.close()


async def test_services_are_probed_again_once_their_host_is_back(sleeps: list[float]) -> None:
    probes = Probes()
    probes.down = {"srv"}
    monitor = Monitor(host_config(), probes)
    async with running(monitor):
        await until(lambda: len(monitor.history("srv-app")) >= 3)
        assert all(r.host_down for r in monitor.history("srv-app"))
        assert "app" not in probes.asked

        probes.down.clear()
        await until(lambda: monitor.history("srv-app")[-1].success)
    assert "app" in probes.asked
    assert monitor.history("srv-app")[-1].host_down is False


async def test_services_of_a_vm_host_are_skipped_while_the_vm_host_is_down(
    sleeps: list[float],
) -> None:
    probes = Probes()
    probes.down = {"vm"}
    monitor = Monitor(host_config(), probes)
    async with running(monitor):
        await until(lambda: len(monitor.history("vm-web")) >= 3)
    assert "web" not in probes.asked
    assert all(r.host_down and not r.success for r in monitor.history("vm-web"))
    # The services of the physical host are not concerned.
    assert monitor.history("srv-app")[-1].success


async def test_a_down_physical_host_does_not_skip_its_vm_hosts_yet(sleeps: list[float]) -> None:
    # Documents the current behaviour (see backend/CLAUDE.md): the vm-host is probed on its own.
    probes = Probes()
    probes.down = {"srv"}
    monitor = Monitor(host_config(), probes)
    async with running(monitor):
        await until(lambda: len(monitor.history("vm")) >= 3 and len(monitor.history("vm-web")) >= 3)
    assert "vm" in probes.asked
    assert monitor.history("vm")[-1].success
    assert monitor.history("vm")[-1].host_down is False
    assert monitor.history("vm-web")[-1].success


async def test_a_failing_restore_is_logged_and_does_not_stop_the_monitor(
    sleeps: list[float], caplog: pytest.LogCaptureFixture
) -> None:
    broken = await memory_database()
    await broken.close()
    monitor = Monitor(make_config(), Probes(), database=broken)
    with caplog.at_level(logging.ERROR, logger="uptime_city.monitor.scheduler"):
        async with running(monitor) as task:
            await until(lambda: len(monitor.history("srv")) >= 3)
            assert not task.done()
    assert "could not restore the results of the last run" in caplog.text


async def test_only_the_last_50_stored_results_are_restored() -> None:
    database = await memory_database()
    now = datetime.now(UTC)
    stored = [ProbeResult(ts=now - timedelta(minutes=60 - n), success=True) for n in range(60)]
    for stored_result in stored:
        await database.results.add("srv", stored_result)

    async def never_answers(hostname: str, timeout: float) -> ProbeResult:
        await asyncio.Event().wait()
        raise AssertionError

    monitor = Monitor(make_config(), never_answers, database=database)
    async with running(monitor):
        await until(lambda: len(monitor.history("srv")) > 0)
    assert HISTORY_SIZE == 50
    assert monitor.history("srv") == stored[-HISTORY_SIZE:]
    await database.close()


def simulated_monitor() -> Monitor:
    config = Config(hosts=[PhysicalHost(name="srv", url="icmp://srv")])
    return Monitor(config, Probes(), Simulation(config))


def test_history_gives_the_last_results_oldest_first() -> None:
    monitor = simulated_monitor()
    for _ in range(5):
        monitor.refresh_simulation()
    everything = monitor.history("srv")
    assert len(everything) == 5
    assert monitor.history("srv", 2) == everything[-2:]
    assert monitor.history("srv", 1) == everything[-1:]
    assert monitor.history("srv", 50) == everything


def test_history_of_an_unknown_endpoint_is_a_key_error() -> None:
    with pytest.raises(KeyError):
        simulated_monitor().history("nope")
