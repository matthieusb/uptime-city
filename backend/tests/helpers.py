from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from uptime_city.config.models import Config, Endpoint, PhysicalHost, Service, VmHost
from uptime_city.main import create_app
from uptime_city.probes.base import ProbeResult

URL = "https://service.test/health"
OPEN = "uptime_city.probes.tcp.asyncio.open_connection"


def fake_writer() -> MagicMock:
    writer = MagicMock()
    writer.wait_closed = AsyncMock()
    return writer


def endpoint(**kwargs: object) -> Endpoint:
    data: dict[str, object] = {"name": "svc", "url": URL, "conditions": ["[STATUS] == 200"]}
    data.update(kwargs)
    return Endpoint.model_validate(data)


NOW = datetime(2026, 1, 31, 12, 0, tzinfo=UTC)


def result(minutes_ago: int, success: bool = True, error: str | None = None) -> ProbeResult:
    return ProbeResult(
        ts=NOW - timedelta(minutes=minutes_ago),
        success=success,
        latency_ms=None if error else 3.5,
        error=error,
        host_down=error == "host is down",
    )


async def ok_probe(hostname: str, timeout: float) -> ProbeResult:
    return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=2.0)


def make_client(
    simulate: bool = False,
    lab_name: str | None = None,
    storage: dict[str, str] | None = None,
) -> TestClient:
    config = Config.model_validate(
        {
            "storage": storage or {"type": "memory"},
            **({"lab-name": lab_name} if lab_name else {}),
            "hosts": [
                {
                    "name": "Macro Server 1",
                    "url": "icmp://macro-server1",
                    "interval": "10ms",
                    "services": [{"name": "ssh", "url": "icmp://macro-server1", "interval": "5s"}],
                    "vm-hosts": [
                        {
                            "name": "Monitoring VM",
                            "url": "icmp://monitoring-vm",
                            "interval": "7s",
                            "services": [{"name": "web", "url": "icmp://monitoring-vm"}],
                        }
                    ],
                }
            ],
        }
    )
    return TestClient(create_app(config, ok_probe, simulate))


def make_simulation_config() -> Config:
    """Ten hosts, each with a service and a vm of one service: 20 services."""

    def host(n: int) -> PhysicalHost:
        return PhysicalHost.model_validate(
            {
                "name": f"h{n}",
                "url": f"icmp://h{n}",
                "services": [Service(name="s", url=f"icmp://h{n}s")],
                "vm-hosts": [
                    VmHost(
                        name=f"h{n}-vm",
                        url=f"icmp://h{n}vm",
                        services=[Service(name="v", url=f"icmp://h{n}v")],
                    )
                ],
            }
        )

    return Config(hosts=[host(n) for n in range(10)])


def is_down(result: ProbeResult) -> bool:
    return not result.success and not result.host_down


def is_standby(result: ProbeResult) -> bool:
    return not result.success and result.host_down
