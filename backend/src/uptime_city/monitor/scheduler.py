import asyncio
from collections import deque
from datetime import UTC, datetime

from uptime_city.config.models import Config, Endpoint
from uptime_city.probes.base import Probe, ProbeResult
from uptime_city.probes.http import probe_http
from uptime_city.probes.tcp import connect

HISTORY_SIZE = 50
# For TCP and ICMP checks: `client.timeout` only applies to HTTP so far.
PROBE_TIMEOUT_S = 5.0


class Monitor:
    """Probes each endpoint on its own interval and keeps the last results in memory.

    A service whose host is down is not probed: it is recorded as down, flagged `host_down`.
    """

    def __init__(self, config: Config, probe: Probe) -> None:
        self.endpoints = {endpoint.id: endpoint for endpoint in config.endpoints}
        self._probe = probe
        self._results = {id: deque[ProbeResult](maxlen=HISTORY_SIZE) for id in self.endpoints}

    def history(self, endpoint_id: str, limit: int = HISTORY_SIZE) -> list[ProbeResult]:
        """Last `limit` results, oldest first."""
        return list(self._results[endpoint_id])[-limit:]

    async def run(self) -> None:
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
        if endpoint.scheme == "tcp" and endpoint.port is not None:
            return await connect(endpoint.hostname, endpoint.port, PROBE_TIMEOUT_S)
        return await self._probe(endpoint.hostname, PROBE_TIMEOUT_S)

    async def _loop(self, endpoint: Endpoint) -> None:
        while True:
            self._results[endpoint.id].append(await self._check(endpoint))
            await asyncio.sleep(endpoint.interval.total_seconds())
