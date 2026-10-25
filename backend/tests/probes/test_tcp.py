import asyncio
import socket
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.helpers import OPEN, fake_writer
from uptime_city.probes.tcp import connect


async def test_connect_success() -> None:
    mock = AsyncMock(return_value=(MagicMock(), fake_writer()))
    with patch(OPEN, mock):
        result = await connect("db", 5432, 1)
    mock.assert_awaited_once_with("db", 5432)
    assert result.success
    assert result.latency_ms is not None and result.latency_ms >= 0
    assert result.error is None


@pytest.mark.parametrize(
    "exc", [ConnectionRefusedError("refused"), socket.gaierror(-2, "Name or service not known")]
)
async def test_connect_failure(exc: OSError) -> None:
    with patch(OPEN, AsyncMock(side_effect=exc)):
        result = await connect("db", 5432, 1)
    assert not result.success
    assert result.latency_ms is None
    assert result.error


async def test_connect_timeout() -> None:
    async def hang(host: str, port: int) -> None:
        await asyncio.sleep(10)

    with patch(OPEN, hang):
        result = await connect("db", 5432, 0.01)
    assert not result.success
    assert result.error is not None and "timeout" in result.error
