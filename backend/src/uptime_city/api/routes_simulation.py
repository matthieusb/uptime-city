from fastapi import APIRouter, HTTPException, Query, Request

from uptime_city.api.deps import get_monitor
from uptime_city.api.routes_info import Info, info
from uptime_city.monitor.simulation import Action
from uptime_city.monitor.simulation_control import SimulationControl

router = APIRouter(prefix="/api/v1")


# The control of the simulation, when the backend simulates its statuses: these routes answer 404
# otherwise.
def _simulating(request: Request) -> SimulationControl:
    control = get_monitor(request).simulation_control
    if control is None:
        raise HTTPException(status_code=404, detail="the backend is not simulating")
    return control


@router.post("/simulation/refresh")
async def refresh_simulation(request: Request) -> Info:
    """Redraws the simulated statuses now. Only in simulation."""
    _simulating(request).refresh()
    return await info(request)


@router.post("/simulation/start")
async def start_simulation(request: Request) -> Info:
    """Redraws the simulated statuses every period from now on. Only in simulation."""
    _simulating(request).start()
    return await info(request)


@router.post("/simulation/stop")
async def stop_simulation(request: Request) -> Info:
    """Stops redrawing the simulated statuses by themselves. Only in simulation."""
    _simulating(request).stop()
    return await info(request)


@router.post("/simulation/actions/{action}")
async def simulation_action(request: Request, action: Action, count: int = Query(1, ge=1)) -> Info:
    """Changes the simulated statuses by hand, instead of what would happen at random: `reset`
    brings everything up, `nuke-host`, `demolish-vm`, `down-services` take a physical host, a
    vm-host or `count` services down, `revive-host`, `revive-vm`, `revive-services` bring one
    host, one vm-host or `count` services back up. Only in a stopped simulation."""
    control = _simulating(request)
    if control.running:
        raise HTTPException(status_code=409, detail="stop the simulation first")
    control.act(action, count)
    return await info(request)
