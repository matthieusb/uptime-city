import asyncio

import pytest

from tests.monitor.helpers import real_sleep


@pytest.fixture
def sleeps(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """Replaces the scheduler's sleeps by a yield to the event loop, and records their delays."""
    delays: list[float] = []

    async def fake_sleep(delay: float, result: object = None) -> None:
        delays.append(delay)
        await real_sleep(0)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    return delays
