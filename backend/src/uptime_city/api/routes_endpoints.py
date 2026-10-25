import secrets
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from uptime_city.monitor.scheduler import HISTORY_SIZE, Monitor
from uptime_city.monitor.simulation import Action
from uptime_city.probes.base import ProbeResult
from uptime_city.storage.settings import SettingsStore

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


class Info(BaseModel):
    lab_name: str
    """The name of the lab, set by `lab-name` in the config."""
    simulation: bool
    """The statuses are faked, nothing is probed."""
    simulation_running: bool
    """In simulation, the statuses are redrawn every period: false until it is started."""
    next_refresh_in_s: float | None
    """In simulation, the seconds until the statuses are redrawn: the full period while stopped."""


class CitySettings(BaseModel):
    seed: str
    """Decides how the 3D city is laid out: empty until the city is first regenerated."""


CITY_SEED = "city_seed"


def _store(request: Request) -> SettingsStore:
    return request.app.state.database.settings


def _monitor(request: Request) -> Monitor:
    return request.app.state.monitor


@router.get("/info")
async def info(request: Request) -> Info:
    monitor = _monitor(request)
    return Info(
        lab_name=monitor.lab_name,
        simulation=monitor.simulation is not None,
        simulation_running=monitor.simulation_running,
        next_refresh_in_s=monitor.next_refresh_in_s(),
    )


@router.get("/city")
async def city(request: Request) -> CitySettings:
    return CitySettings(seed=await _store(request).get(CITY_SEED) or "")


@router.post("/city/regenerate")
async def regenerate_city(request: Request) -> CitySettings:
    """Draws a new seed for the city and keeps it."""
    seed = secrets.token_urlsafe(6)
    await _store(request).set(CITY_SEED, seed)
    return CitySettings(seed=seed)


def _simulating(request: Request) -> Monitor:
    monitor = _monitor(request)
    if monitor.simulation is None:
        raise HTTPException(status_code=404, detail="the backend is not simulating")
    return monitor


@router.post("/simulation/refresh")
async def refresh_simulation(request: Request) -> Info:
    """Redraws the simulated statuses now. Only in simulation."""
    _simulating(request).refresh_simulation()
    return await info(request)


@router.post("/simulation/start")
async def start_simulation(request: Request) -> Info:
    """Redraws the simulated statuses every period from now on. Only in simulation."""
    _simulating(request).start_simulation()
    return await info(request)


@router.post("/simulation/stop")
async def stop_simulation(request: Request) -> Info:
    """Stops redrawing the simulated statuses by themselves. Only in simulation."""
    _simulating(request).stop_simulation()
    return await info(request)


@router.post("/simulation/actions/{action}")
async def simulation_action(request: Request, action: Action, count: int = Query(1, ge=1)) -> Info:
    """Changes the simulated statuses by hand, instead of what would happen at random: `reset`
    brings everything up, `nuke-host`, `demolish-vm`, `down-services` take a physical host, a
    vm-host or `count` services down, `revive-host`, `revive-vm`, `revive-services` bring one
    host, one vm-host or `count` services back up. Only in a stopped simulation."""
    monitor = _simulating(request)
    if monitor.simulation_running:
        raise HTTPException(status_code=409, detail="stop the simulation first")
    monitor.act_on_simulation(action, count)
    return await info(request)


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


@router.get("/endpoints/{endpoint_id}/history")
async def endpoint_history(
    request: Request, endpoint_id: str, limit: int = Query(HISTORY_SIZE, ge=1, le=HISTORY_SIZE)
) -> list[ProbeResult]:
    monitor = _monitor(request)
    if endpoint_id not in monitor.endpoints:
        raise HTTPException(status_code=404, detail="unknown endpoint")
    return monitor.history(endpoint_id, limit)
