import asyncio
import contextlib
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from uptime_city.api import routers
from uptime_city.config.models import Config
from uptime_city.monitor.scheduler import Monitor
from uptime_city.monitor.simulation import Simulation
from uptime_city.probes.base import Probe
from uptime_city.probes.icmp import ping
from uptime_city.storage.database import Database


def create_app(config: Config, probe: Probe = ping, simulate: bool = False) -> FastAPI:
    database = Database(config.storage)
    monitor = Monitor(config, probe, Simulation(config) if simulate else None, database)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        await database.init()
        task = asyncio.create_task(monitor.run())
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            await database.close()

    app = FastAPI(title="uptime-city", lifespan=lifespan)
    app.state.monitor = monitor
    app.state.database = database
    for router in routers:
        app.include_router(router)

    return app
