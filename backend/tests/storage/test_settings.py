from pathlib import Path

from uptime_city.config.models import StorageConfig
from uptime_city.storage.database import Database


async def test_a_setting_is_none_until_set_then_replaced() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    assert await database.settings.get("city_seed") is None
    await database.settings.set("city_seed", "a")
    await database.settings.set("city_seed", "b")
    assert await database.settings.get("city_seed") == "b"
    await database.close()


async def test_settings_survive_a_restart_with_sqlite(tmp_path: Path) -> None:
    config = StorageConfig(type="sqlite", path=str(tmp_path / "sub" / "uptime.db"))
    first = Database(config)
    await first.init()
    await first.settings.set("city_seed", "kept")
    await first.close()

    second = Database(config)
    await second.init()
    assert await second.settings.get("city_seed") == "kept"
    await second.close()
