from unittest.mock import AsyncMock, MagicMock

URL = "https://service.test/health"
OPEN = "uptime_city.probes.tcp.asyncio.open_connection"


def fake_writer() -> MagicMock:
    writer = MagicMock()
    writer.wait_closed = AsyncMock()
    return writer
