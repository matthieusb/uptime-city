from pathlib import Path

import pytest
from pydantic import ValidationError

from tests.config.helpers import write
from uptime_city.config.loader import load_config


def test_load_config(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: Macro Server 1
            url: icmp://macro-server1
            interval: 30s
        """,
    )
    config = load_config(path)
    (host,) = config.hosts
    assert host.id == "macro-server-1"
    assert host.hostname == "macro-server1"
    assert host.interval.total_seconds() == 30
    assert host.services == []


def test_config_rejects_duplicate_ids(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: a
            url: icmp://a
            services:
              - {name: b, url: icmp://b}
          - name: a-b
            url: icmp://ab
        """,
    )
    with pytest.raises(ValidationError, match="duplicate"):
        load_config(path)


def test_config_rejects_group_field(tmp_path: Path) -> None:
    path = write(tmp_path, "hosts:\n  - {name: a, url: 'icmp://a', group: core}\n")
    with pytest.raises(ValidationError):
        load_config(path)


def test_config_rejects_duplicate_ids_across_vm_hosts(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: nas
            url: icmp://nas
            vm-hosts:
              - {name: vm, url: 'icmp://vm'}
          - {name: vm, url: 'icmp://other'}
        """,
    )
    with pytest.raises(ValidationError, match="duplicate"):
        load_config(path)


def test_lab_name_defaults_to_lab_map(tmp_path: Path) -> None:
    config = load_config(write(tmp_path, "hosts:\n  - {name: a, url: icmp://a}\n"))
    assert config.lab_name == "lab-map"


def test_lab_name_can_be_set_at_the_top_of_the_config(tmp_path: Path) -> None:
    config = load_config(
        write(
            tmp_path,
            """
            lab-name: Home lab
            hosts:
              - {name: a, url: icmp://a}
            """,
        )
    )
    assert config.lab_name == "Home lab"


@pytest.mark.parametrize("value", ['""', '"   "'])
def test_lab_name_cannot_be_empty(tmp_path: Path, value: str) -> None:
    path = write(tmp_path, f"lab-name: {value}\nhosts:\n  - {{name: a, url: icmp://a}}\n")
    with pytest.raises(ValidationError):
        load_config(path)


def test_config_requires_the_hosts_key(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="hosts"):
        load_config(write(tmp_path, "lab-name: lonely\n"))


def test_config_rejects_an_unknown_top_level_key(tmp_path: Path) -> None:
    path = write(tmp_path, "hostz: []\nhosts:\n  - {name: a, url: 'icmp://a'}\n")
    with pytest.raises(ValidationError, match="hostz"):
        load_config(path)


@pytest.mark.parametrize("where", ["host", "service", "vm-host"])
def test_config_rejects_a_misspelled_endpoint_key(tmp_path: Path, where: str) -> None:
    typo = "interva: 30s"
    hosts = {
        "host": f"- {{name: a, url: 'icmp://a', {typo}}}",
        "service": f"- name: a\n    url: icmp://a\n    services:\n      - {{name: b, url: 'icmp://b', {typo}}}",
        "vm-host": f"- name: a\n    url: icmp://a\n    vm-hosts:\n      - {{name: v, url: 'icmp://v', {typo}}}",
    }[where]
    with pytest.raises(ValidationError, match="interva"):
        load_config(write(tmp_path, f"hosts:\n  {hosts}\n"))
