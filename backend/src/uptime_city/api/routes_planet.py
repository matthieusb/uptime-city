import secrets

from fastapi import APIRouter, Request
from pydantic import BaseModel

from uptime_city.api.deps import get_store

router = APIRouter(prefix="/api/v1")

PLANET_SEED = "planet_seed"


class PlanetSettings(BaseModel):
    seed: str
    """Decides how the 3D planet is laid out: empty until the planet is first regenerated."""


# The seed the frontend draws the 3D planet from, apart from the one of the flat city.
@router.get("/planet")
async def planet(request: Request) -> PlanetSettings:
    return PlanetSettings(seed=await get_store(request).get(PLANET_SEED) or "")


@router.post("/planet/regenerate")
async def regenerate_planet(request: Request) -> PlanetSettings:
    """Draws a new seed for the planet and keeps it."""
    seed = secrets.token_urlsafe(6)
    await get_store(request).set(PLANET_SEED, seed)
    return PlanetSettings(seed=seed)
