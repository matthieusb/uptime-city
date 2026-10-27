from fastapi import APIRouter, Request
from pydantic import BaseModel

from uptime_city.api.deps import get_monitor

router = APIRouter(prefix="/api/v1")


class Info(BaseModel):
    lab_name: str
    """The name of the lab, set by `lab-name` in the config."""
    simulation: bool
    """The statuses are faked, nothing is probed."""
    simulation_running: bool
    """In simulation, the statuses are redrawn every period: false until it is started."""
    next_refresh_in_s: float | None
    """In simulation, the seconds until the statuses are redrawn: the full period while stopped."""


# What the frontend needs to know about the backend itself: the lab name, and whether and how the
# statuses are simulated. The simulation routes answer with the same body.
@router.get("/info")
async def info(request: Request) -> Info:
    monitor = get_monitor(request)
    return Info(
        lab_name=monitor.lab_name,
        simulation=monitor.simulation is not None,
        simulation_running=monitor.simulation_running,
        next_refresh_in_s=monitor.next_refresh_in_s(),
    )
