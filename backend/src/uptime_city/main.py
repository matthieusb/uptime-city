import argparse
import asyncio
import contextlib
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from uptime_city.api.routes_endpoints import router
from uptime_city.config.loader import load_config
from uptime_city.config.models import Config
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import Probe
from uptime_city.probes.icmp import ping


def create_app(config: Config, probe: Probe = ping) -> FastAPI:
    monitor = Monitor(config, probe)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        task = asyncio.create_task(monitor.run())
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="uptime-city", lifespan=lifespan)
    app.state.monitor = monitor
    app.include_router(router)

    @app.get("/api/v1/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    return app


def run() -> None:
    parser = argparse.ArgumentParser(prog="uptime-city")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    uvicorn.run(create_app(load_config(args.config)), host="127.0.0.1", port=8000)
