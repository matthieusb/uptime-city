import pytest

from uptime_city.conditions.evaluate import evaluate_condition

VALUES = {"STATUS": 200, "RESPONSE_TIME": 12.5, "DELTA": -3}


@pytest.mark.parametrize(
    ("condition", "expected"),
    [
        ("[STATUS] == 200", True),
        ("[STATUS] == 201", False),
        ("[STATUS] != 200", False),
        ("[STATUS] != 201", True),
        ("[STATUS] < 200", False),
        ("[STATUS] < 201", True),
        ("[STATUS] <= 199", False),
        ("[STATUS] <= 200", True),
        ("[STATUS] > 200", False),
        ("[STATUS] > 199", True),
        ("[STATUS] >= 201", False),
        ("[STATUS] >= 200", True),
    ],
)
def test_every_operator_at_its_boundary(condition: str, expected: bool) -> None:
    assert evaluate_condition(condition, VALUES) is expected


@pytest.mark.parametrize(
    ("condition", "expected"),
    [
        ("[RESPONSE_TIME] < 12.6", True),
        ("[RESPONSE_TIME] < 12.5", False),
        ("[RESPONSE_TIME] <= 12.5", True),
        ("[RESPONSE_TIME] == 12.5", True),
        ("[STATUS] > 199.5", True),
    ],
)
def test_floats(condition: str, expected: bool) -> None:
    assert evaluate_condition(condition, VALUES) is expected


@pytest.mark.parametrize(
    ("condition", "expected"),
    [
        ("[DELTA] == -3", True),
        ("[DELTA] < -2", True),
        ("[DELTA] > -3", False),
        ("[DELTA] >= -3.0", True),
        ("[STATUS] > -1", True),
    ],
)
def test_negative_numbers(condition: str, expected: bool) -> None:
    assert evaluate_condition(condition, VALUES) is expected


@pytest.mark.parametrize(
    "condition", ["  [STATUS] == 200", "[STATUS] == 200   ", "[STATUS]==200", "[STATUS]   >=   200"]
)
def test_surrounding_whitespace_is_ignored(condition: str) -> None:
    assert evaluate_condition(condition, VALUES) is True


@pytest.mark.parametrize(
    "condition",
    [
        "[UNKNOWN] == 1",  # no such placeholder in the values
        "[STATUS] == OK",  # not a number
        "[STATUS] == ",  # no value
        "[STATUS] 200",  # no operator
        "[STATUS] = 200",  # not an operator
        "STATUS == 200",  # no brackets
        "",
    ],
)
def test_unsupported_conditions_raise(condition: str) -> None:
    with pytest.raises(ValueError, match="unsupported condition"):
        evaluate_condition(condition, VALUES)
