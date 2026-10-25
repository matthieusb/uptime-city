import asyncio
import random

import pytest

from uptime_city.config.models import Config, PhysicalHost, Service, VmHost
from uptime_city.main import parse_args
from uptime_city.monitor.scheduler import Monitor
from uptime_city.monitor.simulation import Action, Simulation, simulate
from uptime_city.probes.base import ProbeResult


def make_config() -> Config:
    """Ten hosts, each with a service and a vm of one service: 20 services."""

    def host(n: int) -> PhysicalHost:
        return PhysicalHost.model_validate(
            {
                "name": f"h{n}",
                "url": f"icmp://h{n}",
                "services": [Service(name="s", url=f"icmp://h{n}s")],
                "vm-hosts": [
                    VmHost(
                        name=f"h{n}-vm",
                        url=f"icmp://h{n}vm",
                        services=[Service(name="v", url=f"icmp://h{n}v")],
                    )
                ],
            }
        )

    return Config(hosts=[host(n) for n in range(10)])


def is_down(result: ProbeResult) -> bool:
    return not result.success and not result.host_down


def is_standby(result: ProbeResult) -> bool:
    return not result.success and result.host_down


def test_simulation_keeps_the_global_proportions_of_services() -> None:
    config = make_config()
    for seed in range(50):
        results = simulate(config, random.Random(seed))
        services = [results[e.id] for e in config.endpoints if e.kind == "service"]
        assert sum(is_down(r) for r in services) == 4  # 20%
        assert sum(is_standby(r) for r in services) == 1  # 5%
        assert sum(r.success for r in services) == 15  # 75%


def test_simulation_is_consistent_with_the_hosts() -> None:
    config = make_config()
    for seed in range(100):
        results = simulate(config, random.Random(seed))
        for host in config.hosts:
            if not results[host.id].success:
                for vm in host.vm_hosts:
                    assert not results[vm.id].success
                assert all(is_down(results[s.id]) for s in host.services)
            for vm in host.vm_hosts:
                if not results[vm.id].success:
                    assert all(is_down(results[s.id]) for s in vm.services)


def test_simulation_takes_hosts_and_vms_down_sometimes() -> None:
    config = make_config()
    runs = [simulate(config, random.Random(seed)) for seed in range(100)]
    assert any(not r[h.id].success for r in runs for h in config.hosts)
    assert any(
        not r[vm.id].success and r[h.id].success
        for r in runs
        for h in config.hosts
        for vm in h.vm_hosts
    )


def test_simulation_changes_over_time() -> None:
    config = make_config()
    rng = random.Random(1)
    first = simulate(config, rng)
    others = [simulate(config, rng) for _ in range(5)]
    assert any(
        {k: v.success for k, v in o.items()} != {k: v.success for k, v in first.items()}
        for o in others
    )


def test_simulation_refreshes_every_30_seconds_by_default() -> None:
    assert Simulation(make_config()).period_s == 30


def test_simulation_tells_when_its_next_refresh_comes() -> None:
    simulation = Simulation(make_config())
    assert simulation.next_roll_in_s() == 30
    simulation.roll()
    assert 29 < simulation.next_roll_in_s() <= 30


def test_simulation_restarts_its_countdown() -> None:
    simulation = Simulation(make_config(), period_s=30)
    simulation.roll()
    simulation.restart()
    assert 29 < simulation.next_roll_in_s() <= 30


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


@pytest.mark.parametrize("flag", ["--simulate", "-s"])
def test_simulate_option(flag: str) -> None:
    assert parse_args([flag]).simulate is True
    assert parse_args([]).simulate is False


def calm() -> Simulation:
    """A simulation with everything up and running."""
    simulation = Simulation(make_config(), rng=random.Random(3))
    simulation.act("reset")
    return simulation


def repeat(simulation: Simulation, action: Action, times: int) -> dict[str, ProbeResult]:
    results = simulation.act(action)
    for _ in range(times - 1):
        results = simulation.act(action)
    return results


def down_ids(results: dict[str, ProbeResult]) -> set[str]:
    return {id for id, r in results.items() if not r.success}


def test_reset_brings_everything_up() -> None:
    simulation = Simulation(make_config(), rng=random.Random(3))
    simulation.roll()
    results = simulation.act("reset")
    assert all(r.success for r in results.values())


def test_nuke_host_takes_one_physical_host_down_with_everything_on_it() -> None:
    simulation = calm()
    config = make_config()
    results = simulation.act("nuke-host")
    down = down_ids(results)
    hosts = [h for h in config.hosts if h.id in down]
    assert len(hosts) == 1
    host = hosts[0]
    expected = {host.id, *(s.id for s in host.services)}
    for vm in host.vm_hosts:
        expected |= {vm.id, *(s.id for s in vm.services)}
    assert down == expected


def test_nuke_host_picks_hosts_that_are_still_up_and_stops_when_none_is() -> None:
    simulation = calm()
    results = repeat(simulation, "nuke-host", 10)
    assert len([h for h in make_config().hosts if h.id in down_ids(results)]) == 10
    assert down_ids(simulation.act("nuke-host")) == down_ids(results)


def test_demolish_vm_takes_one_vm_down_on_a_host_that_is_up() -> None:
    simulation = calm()
    config = make_config()
    results = simulation.act("demolish-vm")
    vms = [vm for h in config.hosts for vm in h.vm_hosts if vm.id in down_ids(results)]
    assert len(vms) == 1
    assert down_ids(results) == {vms[0].id, *(s.id for s in vms[0].services)}
    assert all(results[h.id].success for h in config.hosts)


def test_demolish_vm_never_picks_a_vm_of_a_nuked_host() -> None:
    simulation = calm()
    config = make_config()
    results = repeat(simulation, "nuke-host", 9)
    last = next(h for h in config.hosts if results[h.id].success)
    results = simulation.act("demolish-vm")
    assert not results[last.vm_hosts[0].id].success
    assert down_ids(simulation.act("demolish-vm")) == down_ids(results)


def test_down_services_takes_that_many_up_services_down() -> None:
    simulation = calm()
    config = make_config()
    services = {e.id for e in config.endpoints if e.kind == "service"}
    results = simulation.act("down-services", 3)
    assert len(down_ids(results)) == 3
    assert down_ids(results) <= services
    assert all(is_down(results[id]) for id in down_ids(results))


def test_down_services_only_takes_those_that_are_still_up() -> None:
    simulation = calm()
    for _ in range(9):
        simulation.act("nuke-host")
    results = simulation.act("down-services", 50)
    services = [e.id for e in make_config().endpoints if e.kind == "service"]
    assert all(not results[id].success for id in services)
    # Only the 2 services of the last host were up: the others were down with their host.
    assert sum(is_down(results[id]) for id in services) == 20


def test_revive_host_brings_one_nuked_host_back_with_what_is_on_it() -> None:
    simulation = calm()
    config = make_config()
    results = repeat(simulation, "nuke-host", 3)
    results = simulation.act("revive-host")
    assert len([h for h in config.hosts if not results[h.id].success]) == 2
    assert len(down_ids(results)) == 2 * 4


def test_revive_host_does_nothing_when_all_are_up() -> None:
    simulation = calm()
    assert down_ids(simulation.act("revive-host")) == set()


def test_revive_vm_brings_one_demolished_vm_back() -> None:
    simulation = calm()
    simulation.act("demolish-vm")
    results = simulation.act("demolish-vm")
    assert len(down_ids(results)) == 4
    results = simulation.act("revive-vm")
    assert len(down_ids(results)) == 2


def test_revive_vm_leaves_alone_the_vms_of_nuked_hosts() -> None:
    simulation = calm()
    config = make_config()
    for _ in range(10):
        simulation.act("demolish-vm")
    results = repeat(simulation, "nuke-host", 10)
    assert len(down_ids(results)) == len(config.endpoints)
    assert down_ids(simulation.act("revive-vm")) == down_ids(results)


def test_revive_services_brings_that_many_downed_services_back() -> None:
    simulation = calm()
    simulation.act("down-services", 5)
    assert len(down_ids(simulation.act("revive-services", 2))) == 3
    assert down_ids(simulation.act("revive-services", 10)) == set()


def test_revive_services_leaves_alone_the_ones_under_a_nuked_host() -> None:
    simulation = calm()
    config = make_config()
    simulation.act("down-services", 20)
    results = simulation.act("nuke-host")
    nuked = next(h for h in config.hosts if not results[h.id].success)
    results = simulation.act("revive-services", 20)
    expected = {nuked.id, *(s.id for s in nuked.services)}
    for vm in nuked.vm_hosts:
        expected |= {vm.id, *(s.id for s in vm.services)}
    assert down_ids(results) == expected


@pytest.mark.parametrize("value", ["1", "true", "True", "yes", "on"])
def test_simulation_mode_env_enables_the_simulation(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SIMULATION_MODE", value)
    assert parse_args([]).simulate is True


@pytest.mark.parametrize("value", ["", "0", "false", "no", "off"])
def test_simulation_mode_env_falsy_values_keep_it_off(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SIMULATION_MODE", value)
    assert parse_args([]).simulate is False


def test_simulation_mode_env_unset_keeps_it_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIMULATION_MODE", raising=False)
    assert parse_args([]).simulate is False
