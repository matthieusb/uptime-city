import random

import pytest

from tests.monitor.helpers import is_down, is_standby
from tests.monitor.helpers import make_simulation_config as make_config
from uptime_city.monitor.simulation import Simulation, random_state, simulate


def test_simulation_keeps_the_global_proportions_of_services() -> None:
    config = make_config()
    for seed in range(50):
        results = simulate(config, random.Random(seed))
        services = [
            results[endpoint.id] for endpoint in config.endpoints if endpoint.kind == "service"
        ]
        assert sum(is_down(result) for result in services) == 4  # 20%
        assert sum(is_standby(result) for result in services) == 1  # 5%
        assert sum(result.success for result in services) == 15  # 75%


def test_simulation_is_consistent_with_the_hosts() -> None:
    config = make_config()
    for seed in range(100):
        results = simulate(config, random.Random(seed))
        for host in config.hosts:
            if not results[host.id].success:
                for vm_host in host.vm_hosts:
                    assert not results[vm_host.id].success
                assert all(is_down(results[service.id]) for service in host.services)
            for vm_host in host.vm_hosts:
                if not results[vm_host.id].success:
                    assert all(is_down(results[service.id]) for service in vm_host.services)


def test_simulation_takes_hosts_and_vms_down_sometimes() -> None:
    config = make_config()
    runs = [simulate(config, random.Random(seed)) for seed in range(100)]
    assert any(not run[host.id].success for run in runs for host in config.hosts)
    assert any(
        not run[vm_host.id].success and run[host.id].success
        for run in runs
        for host in config.hosts
        for vm_host in host.vm_hosts
    )


def test_simulation_changes_over_time() -> None:
    config = make_config()
    random_generator = random.Random(1)
    first = simulate(config, random_generator)
    others = [simulate(config, random_generator) for _ in range(5)]
    assert any(
        {key: value.success for key, value in other.items()}
        != {key: value.success for key, value in first.items()}
        for other in others
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
        under_host = {service.id for service in host.services}
        for vm_host in host.vm_hosts:
            under_vm = {service.id for service in vm_host.services}
            under_host |= under_vm
            # A vm-host is only drawn down by itself when its host is up.
            if host.id in state.hosts:
                assert vm_host.id not in state.vm_hosts
            if vm_host.id in state.vm_hosts:
                assert not under_vm & (state.services | state.standby)
        if host.id in state.hosts:
            assert not under_host & (state.services | state.standby)
    # Stand-by services are never also down by themselves.
    assert not state.standby & state.services


@pytest.mark.parametrize("seed", SEEDS)
def test_rendered_down_and_standby_services_never_exceed_their_shares(seed: int) -> None:
    config = make_config()
    results = simulate(config, random.Random(seed))
    services = [results[endpoint.id] for endpoint in config.endpoints if endpoint.kind == "service"]
    assert sum(is_down(result) for result in services) <= 4  # 20% of 20
    assert sum(is_standby(result) for result in services) <= 1  # 5% of 20
    # A stand-by service is not counted down by itself, and is never up.
    assert all(not (is_down(result) and is_standby(result)) for result in services)


@pytest.mark.parametrize("seed", SEEDS)
def test_a_down_host_takes_its_vm_hosts_and_services_down(seed: int) -> None:
    config = make_config()
    results = simulate(config, random.Random(seed))
    for host in config.hosts:
        if results[host.id].success:
            continue
        assert all(not results[vm_host.id].success for vm_host in host.vm_hosts)
        every_service = [
            *host.services,
            *(service for vm_host in host.vm_hosts for service in vm_host.services),
        ]
        assert all(is_down(results[service.id]) for service in every_service)
    for host in config.hosts:
        for vm_host in host.vm_hosts:
            if not results[vm_host.id].success:
                assert all(is_down(results[service.id]) for service in vm_host.services)


@pytest.mark.parametrize("seed", SEEDS)
def test_the_same_seed_gives_the_same_state_and_statuses(seed: int) -> None:
    config = make_config()
    assert random_state(config, random.Random(seed)) == random_state(config, random.Random(seed))

    def statuses(seed: int) -> dict[str, tuple[bool, bool, str | None, float | None]]:
        return {
            id: (result.success, result.host_down, result.error, result.latency_ms)
            for id, result in simulate(config, random.Random(seed)).items()
        }

    assert statuses(seed) == statuses(seed)
