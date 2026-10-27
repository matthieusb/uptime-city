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


def _up(random_generator: random.Random) -> ProbeResult:
    return ProbeResult(
        ts=datetime.now(UTC), success=True, latency_ms=round(random_generator.uniform(5, 80), 1)
    )


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
    vm_hosts: set[str] = field(default_factory=set[str])
    """The vm-hosts that are down by themselves."""
    services: set[str] = field(default_factory=set[str])
    """The services that are down by themselves."""
    standby: set[str] = field(default_factory=set[str])
    """The services in stand-by."""


def random_state(config: Config, random_generator: random.Random) -> State:
    """A random, consistent state.

    A physical host is picked to go down with 1/2 chance, and a vm-host with 1/3, as long as the
    services they take down stay within the 20% of services allowed to be down. Single services then
    make up the rest of that share, and 5% of the services are in stand-by.
    """
    services = [endpoint for endpoint in config.endpoints if isinstance(endpoint, Service)]
    down_budget = _count(DOWN_SHARE, len(services))
    down_services: set[str] = set()
    state = State()

    def take_down(group: list[Service]) -> bool:
        ids = {service.id for service in group} - down_services
        if len(down_services) + len(ids) > down_budget:
            return False
        down_services.update(ids)
        return True

    hosts = list(config.hosts)
    random_generator.shuffle(hosts)
    for host in hosts:
        everything = [
            *host.services,
            *(service for vm_host in host.vm_hosts for service in vm_host.services),
        ]
        if random_generator.random() < HOST_DOWN_CHANCE and take_down(everything):
            state.hosts.add(host.id)
            continue
        for vm_host in host.vm_hosts:
            if random_generator.random() < VM_DOWN_CHANCE and take_down(vm_host.services):
                state.vm_hosts.add(vm_host.id)

    free = [service for service in services if service.id not in down_services]
    random_generator.shuffle(free)
    extra = max(0, down_budget - len(down_services))
    state.services = {service.id for service in free[:extra]}
    state.standby = {
        service.id for service in free[extra : extra + _count(STANDBY_SHARE, len(services))]
    }
    return state


def render(config: Config, state: State, random_generator: random.Random) -> dict[str, ProbeResult]:
    """The result of every endpoint in a state."""
    results: dict[str, ProbeResult] = {}

    def render_service(service: Service, down_above: bool) -> None:
        if down_above or service.id in state.services:
            results[service.id] = _down("simulated outage")
        elif service.id in state.standby:
            results[service.id] = _standby()
        else:
            results[service.id] = _up(random_generator)

    for host in config.hosts:
        host_down = host.id in state.hosts
        results[host.id] = _down("host down (simulated)") if host_down else _up(random_generator)
        for service in host.services:
            render_service(service, host_down)
        for vm_host in host.vm_hosts:
            vm_down = host_down or vm_host.id in state.vm_hosts
            if host_down:
                results[vm_host.id] = _down("host down (simulated)")
            elif vm_down:
                results[vm_host.id] = _down("vm host down (simulated)")
            else:
                results[vm_host.id] = _up(random_generator)
            for service in vm_host.services:
                render_service(service, vm_down)
    return results


def simulate(config: Config, random_generator: random.Random) -> dict[str, ProbeResult]:
    """Fake, consistent results for every endpoint."""
    return render(config, random_state(config, random_generator), random_generator)


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


def _apply(
    config: Config, state: State, action: Action, count: int, random_generator: random.Random
) -> None:
    """Changes the state by hand: picks at random among what the action can still change."""
    hosts = {host.id: host for host in config.hosts}
    vm_hosts = [(host, vm_host) for host in config.hosts for vm_host in host.vm_hosts]
    # Every service, with whether the host or vm-host it runs on is down.
    services = [
        (service, host.id in state.hosts) for host in config.hosts for service in host.services
    ] + [
        (service, host.id in state.hosts or vm_host.id in state.vm_hosts)
        for host, vm_host in vm_hosts
        for service in vm_host.services
    ]

    def pick(candidates: list[str], size: int) -> list[str]:
        return random_generator.sample(candidates, min(size, len(candidates)))

    match action:
        case "reset":
            state.hosts.clear()
            state.vm_hosts.clear()
            state.services.clear()
            state.standby.clear()
        case "nuke-host":
            state.hosts.update(pick([id for id in hosts if id not in state.hosts], 1))
        case "demolish-vm":
            up = [
                vm_host.id
                for host, vm_host in vm_hosts
                if host.id not in state.hosts and vm_host.id not in state.vm_hosts
            ]
            state.vm_hosts.update(pick(up, 1))
        case "down-services":
            up = [
                service.id
                for service, above in services
                if not above and service.id not in state.services
            ]
            chosen = pick(up, count)
            state.services.update(chosen)
            state.standby.difference_update(chosen)
        case "revive-host":
            state.hosts.difference_update(pick(sorted(state.hosts), 1))
        case "revive-vm":
            down = [
                vm_host.id
                for host, vm_host in vm_hosts
                if host.id not in state.hosts and vm_host.id in state.vm_hosts
            ]
            state.vm_hosts.difference_update(pick(down, 1))
        case "revive-services":
            down = [
                service.id
                for service, above in services
                if not above and service.id in state.services
            ]
            state.services.difference_update(pick(down, count))


class Simulation:
    """Replaces the probes: the fake statuses of every endpoint, redrawn every `period_s`."""

    def __init__(
        self,
        config: Config,
        period_s: float = PERIOD_S,
        random_generator: random.Random | None = None,
    ) -> None:
        self._config = config
        self._random_generator = random_generator or random.Random()
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
        self._state = random_state(self._config, self._random_generator)
        return render(self._config, self._state, self._random_generator)

    def act(self, action: Action, count: int = 1) -> dict[str, ProbeResult]:
        """Changes the current statuses by hand, as `action` says, and gives all the new results."""
        _apply(self._config, self._state, action, count, self._random_generator)
        return render(self._config, self._state, self._random_generator)
