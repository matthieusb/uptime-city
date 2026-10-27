import asyncio
from types import SimpleNamespace

import pytest

from tests.monitor.helpers import make_simulation_config as make_config
from uptime_city.monitor import simulation as simulation_module
from uptime_city.monitor.scheduler import Monitor
from uptime_city.monitor.simulation import Simulation
from uptime_city.monitor.simulation_control import SimulationControl
from uptime_city.probes.base import ProbeResult


async def ok_probe_unused(hostname: str, timeout: float) -> ProbeResult:
    raise AssertionError("a simulation must not reach any host")


def control_of(monitor: Monitor) -> SimulationControl:
    assert monitor.simulation_control is not None
    return monitor.simulation_control


async def test_monitor_only_redraws_while_the_simulation_runs() -> None:
    config = make_config()
    monitor = Monitor(config, ok_probe_unused, Simulation(config, period_s=0.01))
    control = control_of(monitor)
    first = config.endpoints[0].id
    task = asyncio.create_task(monitor.run())
    await asyncio.sleep(0.1)
    assert len(monitor.history(first)) == 1
    assert control.next_refresh_in_s() == 0.01

    control.start()
    while len(monitor.history(first)) < 3:
        await asyncio.sleep(0.01)
    control.stop()
    await asyncio.sleep(0.05)
    count = len(monitor.history(first))
    await asyncio.sleep(0.1)
    assert len(monitor.history(first)) == count
    task.cancel()


async def test_monitor_simulates_without_probing_anything() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        raise AssertionError("a simulation must not reach any host")

    config = make_config()
    monitor = Monitor(config, probe, Simulation(config, period_s=0.01))
    control_of(monitor).start()
    task = asyncio.create_task(monitor.run())
    while any(len(monitor.history(endpoint.id)) < 3 for endpoint in config.endpoints):
        await asyncio.sleep(0.01)
    task.cancel()

    assert all(
        monitor.history(endpoint.id)[-1].error != "unreachable" for endpoint in config.endpoints
    )


def simulating_monitor() -> Monitor:
    config = make_config()
    return Monitor(config, ok_probe_unused, Simulation(config, period_s=30))


def test_acting_on_a_running_simulation_is_refused() -> None:
    control = control_of(simulating_monitor())
    control.start()
    with pytest.raises(RuntimeError, match="running"):
        control.act("reset")


def test_a_monitor_without_simulation_has_no_simulation_control() -> None:
    monitor = Monitor(make_config(), ok_probe_unused)
    assert monitor.simulation_control is None


def test_starting_a_running_simulation_does_not_restart_the_countdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 100.0
    monkeypatch.setattr(simulation_module, "time", SimpleNamespace(monotonic=lambda: now))
    control = control_of(simulating_monitor())
    control.start()
    assert control.next_refresh_in_s() == 30

    now += 10
    control.start()
    assert control.next_refresh_in_s() == 20


def test_stopping_keeps_the_statuses_and_the_full_period() -> None:
    config = make_config()
    monitor = simulating_monitor()
    control = control_of(monitor)
    control.start()
    control.refresh()
    before = {endpoint.id: monitor.history(endpoint.id) for endpoint in config.endpoints}

    control.stop()

    assert control.running is False
    assert control.next_refresh_in_s() == 30
    assert {endpoint.id: monitor.history(endpoint.id) for endpoint in config.endpoints} == before
