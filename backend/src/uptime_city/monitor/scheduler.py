import asyncio
import logging
from collections import deque
from datetime import UTC, datetime

from uptime_city.config.models import Config, Endpoint
from uptime_city.monitor.simulation import Simulation
from uptime_city.monitor.simulation_control import SimulationControl
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
    With a `simulation`, nothing is probed: `simulation_control` gives every endpoint the simulated
    results (see `simulation_control.py`).
    """

    def __init__(
        self,
        config: Config,
        probe: Probe,
        simulation: Simulation | None = None,
        database: Database | None = None,
    ) -> None:
        self._database = database
        self.lab_name = config.lab_name
        self.endpoints = {endpoint.id: endpoint for endpoint in config.endpoints}
        self._probe = probe
        self._results = {id: deque[ProbeResult](maxlen=HISTORY_SIZE) for id in self.endpoints}
        self.simulation_control = (
            SimulationControl(simulation, self._record) if simulation is not None else None
        )

    def history(self, endpoint_id: str, limit: int = HISTORY_SIZE) -> list[ProbeResult]:
        """Last `limit` results, oldest first."""
        return list(self._results[endpoint_id])[-limit:]

    def _record(self, results: dict[str, ProbeResult]) -> None:
        for id, result in results.items():
            self._results[id].append(result)

    async def run(self) -> None:
        if self.simulation_control is not None:
            await self.simulation_control.run()
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
        try:
            return await self._probe_endpoint(endpoint)
        except Exception as exception:
            # A probe that raises is a failed check: it must not stop the other endpoints.
            logger.exception("the check of %s raised", endpoint.id)
            return ProbeResult(
                ts=datetime.now(UTC),
                success=False,
                error=f"{type(exception).__name__}: {exception}",
            )

    async def _probe_endpoint(self, endpoint: Endpoint) -> ProbeResult:
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
