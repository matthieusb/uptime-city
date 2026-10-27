import asyncio
from datetime import UTC, datetime

from tests.monitor.helpers import (
    Probes,
    host_config,
    make_config_with_service,
    running,
    until,
)
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import ProbeResult


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


async def test_services_are_probed_again_once_their_host_is_back(sleeps: list[float]) -> None:
    probes = Probes()
    probes.down = {"srv"}
    monitor = Monitor(host_config(), probes)
    async with running(monitor):
        await until(lambda: len(monitor.history("srv-app")) >= 3)
        assert all(result.host_down for result in monitor.history("srv-app"))
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
    assert all(result.host_down and not result.success for result in monitor.history("vm-web"))
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
