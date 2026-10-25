from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from uptime_city.config.loader import load_config


def test_a_missing_file_is_a_file_not_found_error(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "nope.yaml")


def test_invalid_yaml_is_a_yaml_error(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("hosts: [unclosed\n  - {")
    with pytest.raises(yaml.YAMLError):
        load_config(path)


@pytest.mark.parametrize("content", ["", "# only a comment\n"])
def test_an_empty_file_is_a_validation_error(tmp_path: Path, content: str) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(content)
    with pytest.raises(ValidationError):
        load_config(path)
