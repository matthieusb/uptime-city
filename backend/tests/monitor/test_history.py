import asyncio
from datetime import UTC, datetime

import pytest

from tests.monitor.helpers import (
    Probes,
    make_config,
)
from uptime_city.config.models import (
    Config,
    PhysicalHost,
)
from uptime_city.monitor.scheduler import Monitor
from uptime_city.monitor.simulation import Simulation
from uptime_city.probes.base import ProbeResult


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


def simulated_monitor() -> Monitor:
    config = Config(hosts=[PhysicalHost(name="srv", url="icmp://srv")])
    return Monitor(config, Probes(), Simulation(config))


def test_history_gives_the_last_results_oldest_first() -> None:
    monitor = simulated_monitor()
    for _ in range(5):
        assert monitor.simulation_control is not None
        monitor.simulation_control.refresh()
    everything = monitor.history("srv")
    assert len(everything) == 5
    assert monitor.history("srv", 2) == everything[-2:]
    assert monitor.history("srv", 1) == everything[-1:]
    assert monitor.history("srv", 50) == everything


def test_history_of_an_unknown_endpoint_is_a_key_error() -> None:
    with pytest.raises(KeyError):
        simulated_monitor().history("nope")
