from fastapi import APIRouter, HTTPException, Query, Request

from uptime_city.api.deps import get_monitor
from uptime_city.api.routes_info import Info, info
from uptime_city.monitor.scheduler import Monitor
from uptime_city.monitor.simulation import Action

router = APIRouter(prefix="/api/v1")


# The monitor, when the backend simulates its statuses: these routes do not exist otherwise.
def _simulating(request: Request) -> Monitor:
    monitor = get_monitor(request)
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
