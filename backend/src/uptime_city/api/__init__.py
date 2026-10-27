from fastapi import APIRouter

from uptime_city.api.routes_city import router as city
from uptime_city.api.routes_endpoints import router as endpoints
from uptime_city.api.routes_health import router as health
from uptime_city.api.routes_info import router as info
from uptime_city.api.routes_planet import router as planet
from uptime_city.api.routes_simulation import router as simulation

# One router per use case, each in its own module.
routers: list[APIRouter] = [info, city, planet, simulation, endpoints, health]
