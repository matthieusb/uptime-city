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
from uptime_city.monitor.simulation import Simulation
from uptime_city.probes.base import Probe
from uptime_city.probes.icmp import ping


def create_app(config: Config, probe: Probe = ping, simulate: bool = False) -> FastAPI:
    monitor = Monitor(config, probe, Simulation(config) if simulate else None)

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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="uptime-city")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    parser.add_argument(
        "-s",
        "--simulate",
        action="store_true",
        help="do not probe anything: simulate consistent statuses and outages, redrawn every 30 seconds once started (stopped at first)",
    )
    return parser.parse_args(argv)


def run() -> None:
    args = parse_args()
    app = create_app(load_config(args.config), simulate=args.simulate)
    uvicorn.run(app, host="127.0.0.1", port=8000)
