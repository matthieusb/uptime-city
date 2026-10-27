import secrets

from fastapi import APIRouter, Request
from pydantic import BaseModel

from uptime_city.api.deps import get_store

router = APIRouter(prefix="/api/v1")

CITY_SEED = "city_seed"


class CitySettings(BaseModel):
    seed: str
    """Decides how the 3D city is laid out: empty until the city is first regenerated."""


# The seed the frontend draws the 3D city from: the same seed lays out the same city.
@router.get("/city")
async def city(request: Request) -> CitySettings:
    return CitySettings(seed=await get_store(request).get(CITY_SEED) or "")


@router.post("/city/regenerate")
async def regenerate_city(request: Request) -> CitySettings:
    """Draws a new seed for the city and keeps it."""
    seed = secrets.token_urlsafe(6)
    await get_store(request).set(CITY_SEED, seed)
    return CitySettings(seed=seed)
