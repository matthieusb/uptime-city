import math
import random
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal, get_args

from uptime_city.config.models import Config, Service
from uptime_city.probes.base import ProbeResult

DOWN_SHARE = 0.20
STANDBY_SHARE = 0.05
HOST_DOWN_CHANCE = 1 / 2
VM_DOWN_CHANCE = 1 / 3
PERIOD_S = 30.0


def _count(share: float, total: int) -> int:
    return math.floor(total * share + 0.5)


def _up(rng: random.Random) -> ProbeResult:
    return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=round(rng.uniform(5, 80), 1))


def _down(error: str) -> ProbeResult:
    return ProbeResult(ts=datetime.now(UTC), success=False, error=error)


def _standby() -> ProbeResult:
    # Shown with no status (orange), like a service that was not probed.
    return ProbeResult(
        ts=datetime.now(UTC), success=False, error="stand-by (simulated)", host_down=True
    )


@dataclass
class State:
    """What is down. A host down takes its vm-hosts and services down, a vm-host its services."""

    hosts: set[str] = field(default_factory=set[str])
    """The physical hosts that are down."""
    vms: set[str] = field(default_factory=set[str])
    """The vm-hosts that are down by themselves."""
    services: set[str] = field(default_factory=set[str])
    """The services that are down by themselves."""
    standby: set[str] = field(default_factory=set[str])
    """The services in stand-by."""


def random_state(config: Config, rng: random.Random) -> State:
    """A random, consistent state.

    A physical host is picked to go down with 1/2 chance, and a vm-host with 1/3, as long as the
    services they take down stay within the 20% of services allowed to be down. Single services then
    make up the rest of that share, and 5% of the services are in stand-by.
    """
    services = [e for e in config.endpoints if isinstance(e, Service)]
    down_budget = _count(DOWN_SHARE, len(services))
    down_services: set[str] = set()
    state = State()

    def take_down(group: list[Service]) -> bool:
        ids = {s.id for s in group} - down_services
        if len(down_services) + len(ids) > down_budget:
            return False
        down_services.update(ids)
        return True

    hosts = list(config.hosts)
    rng.shuffle(hosts)
    for host in hosts:
        everything = [*host.services, *(s for vm in host.vm_hosts for s in vm.services)]
        if rng.random() < HOST_DOWN_CHANCE and take_down(everything):
            state.hosts.add(host.id)
            continue
        for vm in host.vm_hosts:
            if rng.random() < VM_DOWN_CHANCE and take_down(vm.services):
                state.vms.add(vm.id)

    free = [s for s in services if s.id not in down_services]
    rng.shuffle(free)
    extra = max(0, down_budget - len(down_services))
    state.services = {s.id for s in free[:extra]}
    state.standby = {s.id for s in free[extra : extra + _count(STANDBY_SHARE, len(services))]}
    return state


def render(config: Config, state: State, rng: random.Random) -> dict[str, ProbeResult]:
    """The result of every endpoint in a state."""
    results: dict[str, ProbeResult] = {}

    def service(s: Service, down_above: bool) -> None:
        if down_above or s.id in state.services:
            results[s.id] = _down("simulated outage")
        elif s.id in state.standby:
            results[s.id] = _standby()
        else:
            results[s.id] = _up(rng)

    for host in config.hosts:
        host_down = host.id in state.hosts
        results[host.id] = _down("host down (simulated)") if host_down else _up(rng)
        for s in host.services:
            service(s, host_down)
        for vm in host.vm_hosts:
            vm_down = host_down or vm.id in state.vms
            if host_down:
                results[vm.id] = _down("host down (simulated)")
            elif vm_down:
                results[vm.id] = _down("vm host down (simulated)")
            else:
                results[vm.id] = _up(rng)
            for s in vm.services:
                service(s, vm_down)
    return results


def simulate(config: Config, rng: random.Random) -> dict[str, ProbeResult]:
    """Fake, consistent results for every endpoint."""
    return render(config, random_state(config, rng), rng)


Action = Literal[
    "reset",
    "nuke-host",
    "demolish-vm",
    "down-services",
    "revive-host",
    "revive-vm",
    "revive-services",
]
ACTIONS: tuple[Action, ...] = get_args(Action)


def _apply(config: Config, state: State, action: Action, count: int, rng: random.Random) -> None:
    """Changes the state by hand: picks at random among what the action can still change."""
    hosts = {h.id: h for h in config.hosts}
    vms = [(h, vm) for h in config.hosts for vm in h.vm_hosts]
    # Every service, with whether the host or vm-host it runs on is down.
    services = [(s, h.id in state.hosts) for h in config.hosts for s in h.services] + [
        (s, h.id in state.hosts or vm.id in state.vms) for h, vm in vms for s in vm.services
    ]

    def pick(candidates: list[str], n: int) -> list[str]:
        return rng.sample(candidates, min(n, len(candidates)))

    match action:
        case "reset":
            state.hosts.clear()
            state.vms.clear()
            state.services.clear()
            state.standby.clear()
        case "nuke-host":
            state.hosts.update(pick([id for id in hosts if id not in state.hosts], 1))
        case "demolish-vm":
            up = [vm.id for h, vm in vms if h.id not in state.hosts and vm.id not in state.vms]
            state.vms.update(pick(up, 1))
        case "down-services":
            up = [s.id for s, above in services if not above and s.id not in state.services]
            chosen = pick(up, count)
            state.services.update(chosen)
            state.standby.difference_update(chosen)
        case "revive-host":
            state.hosts.difference_update(pick(sorted(state.hosts), 1))
        case "revive-vm":
            down = [vm.id for h, vm in vms if h.id not in state.hosts and vm.id in state.vms]
            state.vms.difference_update(pick(down, 1))
        case "revive-services":
            down = [s.id for s, above in services if not above and s.id in state.services]
            state.services.difference_update(pick(down, count))


class Simulation:
    """Replaces the probes: the fake statuses of every endpoint, redrawn every `period_s`."""

    def __init__(
        self, config: Config, period_s: float = PERIOD_S, rng: random.Random | None = None
    ) -> None:
        self._config = config
        self._rng = rng or random.Random()
        self.period_s = period_s
        self._rolled_at: float | None = None
        self._state = State()

    def next_roll_in_s(self) -> float:
        if self._rolled_at is None:
            return self.period_s
        return max(0.0, self._rolled_at + self.period_s - time.monotonic())

    def restart(self) -> None:
        """Starts the countdown to the next redraw again from the full period."""
        self._rolled_at = time.monotonic()

    def roll(self) -> dict[str, ProbeResult]:
        self._rolled_at = time.monotonic()
        self._state = random_state(self._config, self._rng)
        return render(self._config, self._state, self._rng)

    def act(self, action: Action, count: int = 1) -> dict[str, ProbeResult]:
        """Changes the current statuses by hand, as `action` says, and gives all the new results."""
        _apply(self._config, self._state, action, count, self._rng)
        return render(self._config, self._state, self._rng)
