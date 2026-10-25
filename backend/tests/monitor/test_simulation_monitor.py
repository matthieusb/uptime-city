import asyncio
from types import SimpleNamespace

import pytest

from tests.helpers import make_simulation_config as make_config
from uptime_city.monitor import simulation as simulation_module
from uptime_city.monitor.scheduler import Monitor
from uptime_city.monitor.simulation import Simulation
from uptime_city.probes.base import ProbeResult


async def ok_probe_unused(hostname: str, timeout: float) -> ProbeResult:
    raise AssertionError("a simulation must not reach any host")


async def test_monitor_only_redraws_while_the_simulation_runs() -> None:
    config = make_config()
    monitor = Monitor(config, ok_probe_unused, Simulation(config, period_s=0.01))
    first = config.endpoints[0].id
    task = asyncio.create_task(monitor.run())
    await asyncio.sleep(0.1)
    assert len(monitor.history(first)) == 1
    assert monitor.next_refresh_in_s() == 0.01

    monitor.start_simulation()
    while len(monitor.history(first)) < 3:
        await asyncio.sleep(0.01)
    monitor.stop_simulation()
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
    monitor.start_simulation()
    task = asyncio.create_task(monitor.run())
    while any(len(monitor.history(e.id)) < 3 for e in config.endpoints):
        await asyncio.sleep(0.01)
    task.cancel()

    assert all(monitor.history(e.id)[-1].error != "unreachable" for e in config.endpoints)


def simulating_monitor() -> Monitor:
    config = make_config()
    return Monitor(config, ok_probe_unused, Simulation(config, period_s=30))


def test_acting_on_a_running_simulation_is_refused() -> None:
    monitor = simulating_monitor()
    monitor.start_simulation()
    with pytest.raises(RuntimeError, match="running"):
        monitor.act_on_simulation("reset")


def test_a_monitor_without_simulation_refuses_every_simulation_method() -> None:
    config = make_config()
    monitor = Monitor(config, ok_probe_unused)
    for call in (
        monitor.refresh_simulation,
        monitor.start_simulation,
        monitor.stop_simulation,
        lambda: monitor.act_on_simulation("reset"),
    ):
        with pytest.raises(RuntimeError, match="not simulating"):
            call()
    assert monitor.next_refresh_in_s() is None
    assert monitor.simulation_running is False


def test_starting_a_running_simulation_does_not_restart_the_countdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 100.0
    monkeypatch.setattr(simulation_module, "time", SimpleNamespace(monotonic=lambda: now))
    monitor = simulating_monitor()
    monitor.start_simulation()
    assert monitor.next_refresh_in_s() == 30

    now += 10
    monitor.start_simulation()
    assert monitor.next_refresh_in_s() == 20


def test_stopping_keeps_the_statuses_and_the_full_period() -> None:
    config = make_config()
    monitor = simulating_monitor()
    monitor.start_simulation()
    monitor.refresh_simulation()
    before = {e.id: monitor.history(e.id) for e in config.endpoints}

    monitor.stop_simulation()

    assert monitor.simulation_running is False
    assert monitor.next_refresh_in_s() == 30
    assert {e.id: monitor.history(e.id) for e in config.endpoints} == before
