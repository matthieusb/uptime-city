import argparse
import asyncio
import contextlib
import os
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
    app.include_router(router)

    @app.get("/api/v1/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    return app


def simulation_mode_from_env() -> bool:
    return os.environ.get("SIMULATION_MODE", "").strip().lower() in {"1", "true", "yes", "on"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="uptime-city")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    parser.add_argument(
        "--host",
        default=os.environ.get("UPTIME_CITY_HOST", "127.0.0.1"),
        help="address to listen on (env UPTIME_CITY_HOST, default 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("UPTIME_CITY_PORT", "8000")),
        help="port to listen on (env UPTIME_CITY_PORT, default 8000)",
    )
    parser.add_argument(
        "-s",
        "--simulate",
        action="store_true",
        default=simulation_mode_from_env(),
        help="do not probe anything: simulate consistent statuses and outages, redrawn every 30 seconds once started (stopped at first); also enabled by SIMULATION_MODE=true",
    )
    return parser.parse_args(argv)


def run() -> None:
    args = parse_args()
    app = create_app(load_config(args.config), simulate=args.simulate)
    uvicorn.run(app, host=args.host, port=args.port)
