from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from uptime_city.monitor.scheduler import HISTORY_SIZE, Monitor
from uptime_city.probes.base import ProbeResult

router = APIRouter(prefix="/api/v1")


class EndpointInfo(BaseModel):
    id: str
    name: str
    hostname: str
    interval_s: float
    host_id: str | None
    """Set for services: the id of the host they run on."""
    kind: Literal["physical", "vm", "service"]
    parent_id: str | None
    """Set for vm-hosts: the id of the physical host they run on."""


class HostSummary(BaseModel):
    id: str
    """The id of a physical host."""
    services_up: int
    """Services running correctly, on the host and on its vm-hosts."""
    services_down: int
    """Services that are down, on the host and on its vm-hosts."""


def _monitor(request: Request) -> Monitor:
    return request.app.state.monitor


@router.get("/endpoints")
async def list_endpoints(request: Request) -> list[EndpointInfo]:
    return [
        EndpointInfo(
            id=e.id,
            name=e.name,
            hostname=e.hostname,
            interval_s=e.interval.total_seconds(),
            host_id=e.host_id,
            kind=e.kind,
            parent_id=e.parent_id,
        )
        for e in _monitor(request).endpoints.values()
    ]


@router.get("/hosts/summary")
async def host_summaries(request: Request) -> list[HostSummary]:
    monitor = _monitor(request)
    summaries: list[HostSummary] = []
    for endpoint in monitor.endpoints.values():
        if endpoint.kind != "physical":
            continue
        up, down = monitor.service_counts(endpoint.id)
        summaries.append(HostSummary(id=endpoint.id, services_up=up, services_down=down))
    return summaries


@router.get("/endpoints/{endpoint_id}/history")
async def endpoint_history(
    request: Request, endpoint_id: str, limit: int = Query(HISTORY_SIZE, ge=1, le=HISTORY_SIZE)
) -> list[ProbeResult]:
    monitor = _monitor(request)
    if endpoint_id not in monitor.endpoints:
        raise HTTPException(status_code=404, detail="unknown endpoint")
    return monitor.history(endpoint_id, limit)
