import re
from datetime import timedelta
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator

_DURATION = re.compile(r"^(\d+(?:\.\d+)?)(ms|s|m|h|d)$")
_UNITS = {"ms": 0.001, "s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_duration(value: str) -> timedelta:
    match = _DURATION.match(value.strip())
    if match is None:
        raise ValueError(f"invalid duration {value!r} (expected e.g. 30s, 5m, 1h, 30d)")
    return timedelta(seconds=float(match[1]) * _UNITS[match[2]])


def _to_duration(value: object) -> object:
    return parse_duration(value) if isinstance(value, str) else value


def _positive(value: timedelta) -> timedelta:
    if value <= timedelta(0):
        raise ValueError("a duration must be positive")
    return value


Duration = Annotated[timedelta, BeforeValidator(_to_duration), AfterValidator(_positive)]
