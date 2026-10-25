from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import StaticPool

from uptime_city.config.models import StorageConfig

_SQLITE = "sqlite+aiosqlite://"


def database_url(config: StorageConfig) -> str:
    match config.type:
        case "memory":
            return _SQLITE
        case "sqlite":
            return f"{_SQLITE}/{config.path}"
        case "postgres":
            _, _, rest = config.path.partition("://")
            return f"postgresql+asyncpg://{rest}"


def make_engine(config: StorageConfig) -> AsyncEngine:
    url = database_url(config)
    if config.type == "memory":
        return create_async_engine(url, poolclass=StaticPool)
    if config.type == "sqlite":
        Path(config.path).parent.mkdir(parents=True, exist_ok=True)
    return create_async_engine(url)
