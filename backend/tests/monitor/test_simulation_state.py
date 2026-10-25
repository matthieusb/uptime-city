import random

import pytest

from tests.helpers import is_down, is_standby
from tests.helpers import make_simulation_config as make_config
from uptime_city.monitor.simulation import Simulation, random_state, simulate


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


SEEDS = range(20)


@pytest.mark.parametrize("seed", SEEDS)
def test_a_random_state_is_consistent(seed: int) -> None:
    config = make_config()
    state = random_state(config, random.Random(seed))
    for host in config.hosts:
        under_host = {s.id for s in host.services}
        for vm in host.vm_hosts:
            under_vm = {s.id for s in vm.services}
            under_host |= under_vm
            # A vm-host is only drawn down by itself when its host is up.
            if host.id in state.hosts:
                assert vm.id not in state.vms
            if vm.id in state.vms:
                assert not under_vm & (state.services | state.standby)
        if host.id in state.hosts:
            assert not under_host & (state.services | state.standby)
    # Stand-by services are never also down by themselves.
    assert not state.standby & state.services


@pytest.mark.parametrize("seed", SEEDS)
def test_rendered_down_and_standby_services_never_exceed_their_shares(seed: int) -> None:
    config = make_config()
    results = simulate(config, random.Random(seed))
    services = [results[e.id] for e in config.endpoints if e.kind == "service"]
    assert sum(is_down(r) for r in services) <= 4  # 20% of 20
    assert sum(is_standby(r) for r in services) <= 1  # 5% of 20
    # A stand-by service is not counted down by itself, and is never up.
    assert all(not (is_down(r) and is_standby(r)) for r in services)


@pytest.mark.parametrize("seed", SEEDS)
def test_a_down_host_takes_its_vm_hosts_and_services_down(seed: int) -> None:
    config = make_config()
    results = simulate(config, random.Random(seed))
    for host in config.hosts:
        if results[host.id].success:
            continue
        assert all(not results[vm.id].success for vm in host.vm_hosts)
        every_service = [*host.services, *(s for vm in host.vm_hosts for s in vm.services)]
        assert all(is_down(results[s.id]) for s in every_service)
    for host in config.hosts:
        for vm in host.vm_hosts:
            if not results[vm.id].success:
                assert all(is_down(results[s.id]) for s in vm.services)


@pytest.mark.parametrize("seed", SEEDS)
def test_the_same_seed_gives_the_same_state_and_statuses(seed: int) -> None:
    config = make_config()
    assert random_state(config, random.Random(seed)) == random_state(config, random.Random(seed))

    def statuses(seed: int) -> dict[str, tuple[bool, bool, str | None, float | None]]:
        return {
            id: (r.success, r.host_down, r.error, r.latency_ms)
            for id, r in simulate(config, random.Random(seed)).items()
        }

    assert statuses(seed) == statuses(seed)
