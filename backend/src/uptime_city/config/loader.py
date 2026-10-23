from pathlib import Path

import yaml

from uptime_city.config.models import Config


def load_config(path: Path) -> Config:
    return Config.model_validate(yaml.safe_load(path.read_text()))
