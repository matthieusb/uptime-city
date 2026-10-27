import argparse
import os
from pathlib import Path

import uvicorn

from uptime_city.app import create_app
from uptime_city.config.loader import load_config


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
