import asyncio
import time
from datetime import UTC, datetime
from pathlib import Path

from tests.helpers import make_client
from uptime_city.config.models import StorageConfig
from uptime_city.storage.database import Database


def test_the_city_seed_is_kept_across_restarts(tmp_path: Path) -> None:
    storage = {"type": "sqlite", "path": str(tmp_path / "uptime.db")}
    with make_client(storage=storage) as client:
        seed = client.post("/api/v1/city/regenerate").json()["seed"]
    with make_client(storage=storage) as client:
        assert client.get("/api/v1/city").json() == {"seed": seed}


def test_the_history_is_kept_across_restarts(tmp_path: Path) -> None:
    storage = {"type": "sqlite", "path": str(tmp_path / "uptime.db")}
    with make_client(storage=storage) as client:
        while len(client.get("/api/v1/endpoints/macro-server-1/history").json()) < 3:
            time.sleep(0.01)
    restarted = datetime.now(UTC)
    with make_client(storage=storage) as client:
        history: list[dict[str, str]] = []
        while not history:
            history = client.get("/api/v1/endpoints/macro-server-1/history").json()
            time.sleep(0.01)
    assert datetime.fromisoformat(history[0]["ts"]) < restarted


async def stored_results(storage: dict[str, str]) -> int:
    database = Database(StorageConfig.model_validate(storage))
    await database.init()
    count = len(await database.results.recent("macro-server-1", 50))
    await database.close()
    return count


def test_the_simulated_statuses_are_not_kept(tmp_path: Path) -> None:
    storage = {"type": "sqlite", "path": str(tmp_path / "uptime.db")}
    with make_client(simulate=True, storage=storage) as client:
        assert client.get("/api/v1/endpoints/macro-server-1/history").json()
    assert asyncio.run(stored_results(storage)) == 0
