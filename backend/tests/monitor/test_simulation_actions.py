import random

from tests.helpers import is_down
from tests.helpers import make_simulation_config as make_config
from uptime_city.monitor.simulation import Action, Simulation
from uptime_city.probes.base import ProbeResult


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
