import asyncio
import logging
from collections import deque
from datetime import UTC, datetime

from uptime_city.config.models import Config, Endpoint
from uptime_city.monitor.simulation import Action, Simulation
from uptime_city.probes.base import Probe, ProbeResult
from uptime_city.probes.http import probe_http
from uptime_city.probes.tcp import connect
from uptime_city.storage.database import Database

HISTORY_SIZE = 50
PRUNE_EVERY_S = 3600

logger = logging.getLogger(__name__)


class Monitor:
    """Probes each endpoint on its own interval, keeping the last results in memory and every one
    in the `database` (if any) for its retention. It starts with the last results of the run before.

    A service whose host is down is not probed: it is recorded as down, flagged `host_down`.
    With a `simulation`, nothing is probed: every endpoint gets the simulated results at once, then
    they are redrawn every period, but only once the simulation has been started (stopped at first).
    """

    def __init__(
        self,
        config: Config,
        probe: Probe,
        simulation: Simulation | None = None,
        database: Database | None = None,
    ) -> None:
        self.simulation = simulation
        self._database = database
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
        await self._restore()
        async with asyncio.TaskGroup() as group:
            for endpoint in self.endpoints.values():
                group.create_task(self._loop(endpoint))
            if self._database is not None:
                group.create_task(self._prune_loop(self._database))

    async def _restore(self) -> None:
        """Drops the results past the retention, then reloads the last ones of each endpoint."""
        if self._database is None:
            return
        try:
            await self._prune(self._database)
            for id, results in self._results.items():
                results.extend(await self._database.results.recent(id, HISTORY_SIZE))
        except Exception:
            logger.exception("could not restore the results of the last run")

    async def _prune(self, database: Database) -> None:
        await database.results.prune(datetime.now(UTC) - database.retention)

    async def _prune_loop(self, database: Database) -> None:
        while True:
            await asyncio.sleep(PRUNE_EVERY_S)
            try:
                await self._prune(database)
            except Exception:
                logger.exception("could not delete the results past the retention")

    async def _save(self, endpoint_id: str, result: ProbeResult) -> None:
        if self._database is None:
            return
        try:
            await self._database.results.add(endpoint_id, result)
        except Exception:
            # A database that fails must not stop the monitoring.
            logger.exception("could not save a result of %s", endpoint_id)

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
            result = await self._check(endpoint)
            self._results[endpoint.id].append(result)
            await self._save(endpoint.id, result)
            await asyncio.sleep(endpoint.interval.total_seconds())
