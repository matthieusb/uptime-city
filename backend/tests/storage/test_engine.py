from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine

from uptime_city.config.models import StorageConfig
from uptime_city.storage.database import Database
from uptime_city.storage.engine import make_engine


async def test_a_missing_folder_of_the_sqlite_file_is_created(tmp_path: Path) -> None:
    path = tmp_path / "data" / "nested" / "uptime.db"
    engine = make_engine(StorageConfig(type="sqlite", path=str(path)))
    assert isinstance(engine, AsyncEngine)
    assert path.parent.is_dir()
    await engine.dispose()


async def test_closing_a_database_twice_does_not_raise() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    await database.close()
    await database.close()
