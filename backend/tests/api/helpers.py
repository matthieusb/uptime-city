from datetime import UTC, datetime

from fastapi.testclient import TestClient

from uptime_city.app import create_app
from uptime_city.config.models import Config
from uptime_city.probes.base import ProbeResult


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
