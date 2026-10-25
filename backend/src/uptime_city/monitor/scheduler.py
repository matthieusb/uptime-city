import asyncio
from collections import deque
from datetime import UTC, datetime

from uptime_city.config.models import Config, Endpoint
from uptime_city.monitor.simulation import Action, Simulation
from uptime_city.probes.base import Probe, ProbeResult
from uptime_city.probes.http import probe_http
from uptime_city.probes.tcp import connect

HISTORY_SIZE = 50


class Monitor:
    """Probes each endpoint on its own interval and keeps the last results in memory.

    A service whose host is down is not probed: it is recorded as down, flagged `host_down`.
    With a `simulation`, nothing is probed: every endpoint gets the simulated results at once, then
    they are redrawn every period, but only once the simulation has been started (stopped at first).
    """

    def __init__(self, config: Config, probe: Probe, simulation: Simulation | None = None) -> None:
        self.simulation = simulation
        self.lab_name = config.lab_name
        self.endpoints = {endpoint.id: endpoint for endpoint in config.endpoints}
        self._probe = probe
        self._results = {id: deque[ProbeResult](maxlen=HISTORY_SIZE) for id in self.endpoints}
        self._restart = asyncio.Event()
        self.simulation_running = False

    def history(self, endpoint_id: str, limit: int = HISTORY_SIZE) -> list[ProbeResult]:
        """Last `limit` results, oldest first."""
        return list(self._results[endpoint_id])[-limit:]

    def _roll(self, simulation: Simulation) -> None:
        for id, result in simulation.roll().items():
            self._results[id].append(result)

    def _simulation(self) -> Simulation:
        if self.simulation is None:
            raise RuntimeError("the monitor is not simulating")
        return self.simulation

    def refresh_simulation(self) -> None:
        """Redraws the simulated statuses now, and restarts the countdown to the next redraw."""
        simulation = self._simulation()
        self._roll(simulation)
        simulation.restart()
        self._restart.set()

    def act_on_simulation(self, action: Action, count: int = 1) -> None:
        """Changes the simulated statuses by hand. Only while the simulation is stopped."""
        simulation = self._simulation()
        if self.simulation_running:
            raise RuntimeError("the simulation is running")
        for id, result in simulation.act(action, count).items():
            self._results[id].append(result)

    def start_simulation(self) -> None:
        """Redraws the simulated statuses every period, the countdown starting over."""
        simulation = self._simulation()
        if not self.simulation_running:
            self.simulation_running = True
            simulation.restart()
            self._restart.set()

    def stop_simulation(self) -> None:
        """Keeps the simulated statuses as they are until the simulation is started again."""
        self._simulation()
        self.simulation_running = False
        self._restart.set()

    def next_refresh_in_s(self) -> float | None:
        """Seconds until the next redraw: the full period while the simulation is stopped."""
        if self.simulation is None:
            return None
        if not self.simulation_running:
            return self.simulation.period_s
        return self.simulation.next_roll_in_s()

    async def _simulate(self, simulation: Simulation) -> None:
        self._roll(simulation)
        while True:
            if not self.simulation_running:
                await self._restart.wait()
                self._restart.clear()
                continue
            try:
                await asyncio.wait_for(self._restart.wait(), simulation.period_s)
                self._restart.clear()
            except TimeoutError:
                self._roll(simulation)

    async def run(self) -> None:
        if self.simulation is not None:
            await self._simulate(self.simulation)
            return
        async with asyncio.TaskGroup() as group:
            for endpoint in self.endpoints.values():
                group.create_task(self._loop(endpoint))

    def _host_is_down(self, endpoint: Endpoint) -> bool:
        if endpoint.host_id is None or not self._results[endpoint.host_id]:
            return False
        return not self._results[endpoint.host_id][-1].success

    async def _check(self, endpoint: Endpoint) -> ProbeResult:
        if self._host_is_down(endpoint):
            return ProbeResult(
                ts=datetime.now(UTC), success=False, error="host is down", host_down=True
            )
        if endpoint.is_http:
            return await probe_http(endpoint)
        timeout = endpoint.client.timeout.total_seconds()
        if endpoint.scheme == "tcp" and endpoint.port is not None:
            return await connect(endpoint.hostname, endpoint.port, timeout)
        return await self._probe(endpoint.hostname, timeout)

    async def _loop(self, endpoint: Endpoint) -> None:
        while True:
            self._results[endpoint.id].append(await self._check(endpoint))
            await asyncio.sleep(endpoint.interval.total_seconds())
