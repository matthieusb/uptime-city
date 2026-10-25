from datetime import timedelta

import pytest
from pydantic import ValidationError

from uptime_city.config.models import StorageConfig, parse_duration
from uptime_city.storage.engine import database_url


def test_storage_defaults_to_sqlite_in_the_data_folder() -> None:
    config = StorageConfig()
    assert config.type == "sqlite"
    assert config.path == "data/uptime.db"


def test_storage_rejects_an_unknown_type() -> None:
    with pytest.raises(ValidationError):
        StorageConfig.model_validate({"type": "mysql"})


def test_database_url_per_type() -> None:
    assert database_url(StorageConfig(type="sqlite", path="x/u.db")) == "sqlite+aiosqlite:///x/u.db"
    assert database_url(StorageConfig(type="memory")) == "sqlite+aiosqlite://"
    assert (
        database_url(StorageConfig(type="postgres", path="postgres://u:p@db/uc"))
        == "postgresql+asyncpg://u:p@db/uc"
    )
    assert (
        database_url(StorageConfig(type="postgres", path="postgresql://u:p@db/uc"))
        == "postgresql+asyncpg://u:p@db/uc"
    )


def test_retention_is_30_days_by_default_and_counts_in_days() -> None:
    assert StorageConfig().retention == timedelta(days=30)
    assert StorageConfig.model_validate({"retention": "7d"}).retention == timedelta(days=7)
    assert parse_duration("2d") == timedelta(days=2)


@pytest.mark.parametrize("raw", ["0d", "0s", "0h"])
def test_retention_must_be_positive(raw: str) -> None:
    with pytest.raises(ValidationError, match="positive"):
        StorageConfig.model_validate({"retention": raw})


def test_a_short_positive_retention_is_accepted() -> None:
    assert StorageConfig.model_validate({"retention": "1h"}).retention == timedelta(hours=1)
