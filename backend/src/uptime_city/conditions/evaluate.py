import operator
import re
from collections.abc import Callable, Mapping

_OPS: dict[str, Callable[[float, float], bool]] = {
    "==": operator.eq,
    "!=": operator.ne,
    "<=": operator.le,
    ">=": operator.ge,
    "<": operator.lt,
    ">": operator.gt,
}
_PATTERN = re.compile(r"^\s*\[([A-Z_]+)\]\s*(==|!=|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)\s*$")


def evaluate_condition(condition: str, values: Mapping[str, float]) -> bool:
    """Evaluate `"[PLACEHOLDER] <op> <number>"`. Raises ValueError if unsupported."""
    match = _PATTERN.match(condition)
    if match is None or match[1] not in values:
        raise ValueError(f"unsupported condition: {condition}")
    return _OPS[match[2]](values[match[1]], float(match[3]))
