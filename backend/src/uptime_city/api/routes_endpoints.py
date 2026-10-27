from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from uptime_city.api.deps import get_monitor
from uptime_city.monitor.scheduler import HISTORY_SIZE
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


# The definitions of everything that is monitored: physical hosts, vm-hosts and services.
@router.get("/endpoints")
async def list_endpoints(request: Request) -> list[EndpointInfo]:
    return [
        EndpointInfo(
            id=endpoint.id,
            name=endpoint.name,
            hostname=endpoint.hostname,
            interval_s=endpoint.interval.total_seconds(),
            host_id=endpoint.host_id,
            kind=endpoint.kind,
            parent_id=endpoint.parent_id,
        )
        for endpoint in get_monitor(request).endpoints.values()
    ]


# The last results of one endpoint, at most `limit` of them (the most the monitor keeps).
@router.get("/endpoints/{endpoint_id}/history")
async def endpoint_history(
    request: Request, endpoint_id: str, limit: int = Query(HISTORY_SIZE, ge=1, le=HISTORY_SIZE)
) -> list[ProbeResult]:
    monitor = get_monitor(request)
    if endpoint_id not in monitor.endpoints:
        raise HTTPException(status_code=404, detail="unknown endpoint")
    return monitor.history(endpoint_id, limit)
