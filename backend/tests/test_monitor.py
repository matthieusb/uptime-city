import asyncio
from datetime import UTC, datetime, timedelta

from uptime_city.config.models import ClientConfig, Config, PhysicalHost, Service
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import ProbeResult

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
