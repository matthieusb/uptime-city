import asyncio
from datetime import UTC, datetime, timedelta

from uptime_city.config.models import Config, PhysicalHost, Service
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


def make_config_with_vm() -> Config:
    def service(name: str) -> dict[str, str | timedelta]:
        return {"name": name, "url": f"icmp://{name}", "interval": TICK}

    return Config.model_validate(
        {
            "hosts": [
                {
                    "name": "srv",
                    "url": "icmp://srv",
                    "interval": TICK,
                    "services": [service("good"), service("bad")],
                    "vm-hosts": [
                        {
                            "name": "vm",
                            "url": "icmp://vm",
                            "interval": TICK,
                            "services": [service("vm-good"), service("vm-bad"), service("vm-bad2")],
                        }
                    ],
                }
            ]
        }
    )


async def test_service_counts_cover_services_of_the_host_and_of_its_vm_hosts() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(
            ts=datetime.now(UTC), success="bad" not in hostname, error=None, latency_ms=1.0
        )

    monitor = Monitor(make_config_with_vm(), probe)
    task = asyncio.create_task(monitor.run())
    while not all(monitor.history(id) for id in monitor.endpoints):
        await asyncio.sleep(0.01)
    task.cancel()

    # The hosts themselves are not services, so they are left out.
    assert monitor.service_counts("srv") == (2, 3)


async def test_service_counts_leave_out_services_not_probed_yet() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    monitor = Monitor(make_config_with_vm(), probe)

    assert monitor.service_counts("srv") == (0, 0)


async def test_service_counts_count_the_services_of_a_down_host_as_down() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=hostname != "srv", error="unreachable")

    monitor = Monitor(make_config_with_vm(), probe)
    task = asyncio.create_task(monitor.run())
    # Until the skipped checks of the two services right on the host are recorded.
    while not all(
        monitor.history(id) and monitor.history(id)[-1].host_down for id in ("srv-good", "srv-bad")
    ) or not all(monitor.history(id) for id in monitor.endpoints):
        await asyncio.sleep(0.01)
    task.cancel()

    # The services of the vm-host are probed on their own and are up.
    assert monitor.service_counts("srv") == (3, 2)
