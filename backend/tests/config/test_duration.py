import pytest

from uptime_city.config.models import parse_duration


@pytest.mark.parametrize(
    ("raw", "seconds"), [("30s", 30), ("5m", 300), ("1h", 3600), ("1500ms", 1.5)]
)
def test_parse_duration(raw: str, seconds: float) -> None:
    assert parse_duration(raw).total_seconds() == seconds


def test_parse_duration_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        parse_duration("soon")
