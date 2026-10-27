import asyncio
import contextlib
from collections.abc import AsyncGenerator, Callable
from datetime import UTC, datetime, timedelta

from uptime_city.config.models import (
    Config,
    PhysicalHost,
    Service,
    StorageConfig,
    VmHost,
)
from uptime_city.monitor.scheduler import Monitor
from uptime_city.probes.base import ProbeResult
from uptime_city.storage.database import Database

TICK = timedelta(milliseconds=10)


def make_config() -> Config:
    return Config(hosts=[PhysicalHost(name="srv", url="icmp://srv", interval=TICK)])


def make_config_with_service() -> Config:
    return Config(
        hosts=[
            PhysicalHost(
                name="srv",
                url="icmp://srv",
                interval=TICK,
                services=[Service(name="app", url="icmp://app", interval=TICK)],
            )
        ]
    )


async def memory_database() -> Database:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    return database


real_sleep = asyncio.sleep


async def until(condition: Callable[[], bool]) -> None:
    async with asyncio.timeout(5):
        while not condition():
            await real_sleep(0)


@contextlib.asynccontextmanager
async def running(monitor: Monitor) -> AsyncGenerator[asyncio.Task[None]]:
    task = asyncio.create_task(monitor.run())
    try:
        yield task
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def host_config(*, interval: str = "10ms") -> Config:
    """A physical host with a service, and a vm-host with a service."""
    return Config.model_validate(
        {
            "hosts": [
                {
                    "name": "srv",
                    "url": "icmp://srv",
                    "interval": interval,
                    "services": [{"name": "app", "url": "icmp://app", "interval": interval}],
                    "vm-hosts": [
                        {
                            "name": "vm",
                            "url": "icmp://vm",
                            "interval": interval,
                            "services": [
                                {"name": "web", "url": "icmp://web", "interval": interval}
                            ],
                        }
                    ],
                }
            ]
        }
    )


class Probes:
    """A probe whose hosts can be told to be down, and that remembers what it was asked."""

    def __init__(self) -> None:
        self.down: set[str] = set()
        self.asked: list[str] = []

    async def __call__(self, hostname: str, timeout: float) -> ProbeResult:
        self.asked.append(hostname)
        return ProbeResult(
            ts=datetime.now(UTC),
            success=hostname not in self.down,
            latency_ms=None if hostname in self.down else 1.0,
            error="unreachable" if hostname in self.down else None,
        )


def make_simulation_config() -> Config:
    """Ten hosts, each with a service and a vm of one service: 20 services."""

    def host(number: int) -> PhysicalHost:
        return PhysicalHost.model_validate(
            {
                "name": f"h{number}",
                "url": f"icmp://h{number}",
                "services": [Service(name="s", url=f"icmp://h{number}s")],
                "vm-hosts": [
                    VmHost(
                        name=f"h{number}-vm",
                        url=f"icmp://h{number}vm",
                        services=[Service(name="v", url=f"icmp://h{number}v")],
                    )
                ],
            }
        )

    return Config(hosts=[host(number) for number in range(10)])


def is_down(result: ProbeResult) -> bool:
    return not result.success and not result.host_down


def is_standby(result: ProbeResult) -> bool:
    return not result.success and result.host_down
