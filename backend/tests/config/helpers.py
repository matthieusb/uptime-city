from pathlib import Path
from textwrap import dedent

from tests.probes.helpers import URL
from uptime_city.config.models import Endpoint


def write(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "config.yaml"
    path.write_text(dedent(content))
    return path


VM_CONFIG = """
    hosts:
      - name: nas
        url: icmp://nas
        services:
          - {name: ssh, url: 'tcp://nas:22'}
        vm-hosts:
          - name: nas-vm
            url: icmp://nas-vm
            services:
              - {name: web, url: 'https://vm.example.org', conditions: ['[STATUS] == 200']}
"""


def endpoint(**kwargs: object) -> Endpoint:
    data: dict[str, object] = {"name": "svc", "url": URL, "conditions": ["[STATUS] == 200"]}
    data.update(kwargs)
    return Endpoint.model_validate(data)
