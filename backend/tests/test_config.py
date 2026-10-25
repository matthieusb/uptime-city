from pathlib import Path
from textwrap import dedent

import pytest
from pydantic import ValidationError

from uptime_city.config.loader import load_config
from uptime_city.config.models import parse_duration


@pytest.mark.parametrize(
    ("raw", "seconds"), [("30s", 30), ("5m", 300), ("1h", 3600), ("1500ms", 1.5)]
)
def test_parse_duration(raw: str, seconds: float) -> None:
    assert parse_duration(raw).total_seconds() == seconds


def test_parse_duration_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        parse_duration("soon")


def write(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "config.yaml"
    path.write_text(dedent(content))
    return path


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


def test_load_config_with_services(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: macro-server1
            url: icmp://macro-server1
            interval: 30s
            services:
              - name: ssh
                url: tcp://macro-server1:8291
                interval: 5s
              - name: homer
                url: https://homer.example.org
                conditions: ["[STATUS] == 200"]
        """,
    )
    (host,) = load_config(path).hosts
    ssh, homer = host.services
    assert ssh.id == "macro-server1-ssh"
    assert ssh.host_id == "macro-server1"
    assert ssh.interval.total_seconds() == 5
    # Services never inherit from their host.
    assert homer.interval.total_seconds() == 60
    assert host.host_id is None


def test_host_can_use_any_check(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: web
            url: https://example.org
            conditions: ["[STATUS] == 200"]
        """,
    )
    (host,) = load_config(path).hosts
    assert host.is_http


def test_endpoint_rejects_unsupported_scheme(tmp_path: Path) -> None:
    path = write(tmp_path, "hosts:\n  - {name: web, url: 'ftp://example.org', interval: 30s}\n")
    with pytest.raises(ValidationError):
        load_config(path)


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


@pytest.mark.parametrize(
    "hosts",
    [
        "- {name: web, url: 'https://example.org'}",
        "- {name: web, url: 'http://example.org', conditions: ['[RESPONSE_TIME] < 500']}",
        "- name: srv\n    url: icmp://srv\n    services:\n      - {name: web, url: 'https://example.org'}",
    ],
)
def test_http_endpoint_requires_a_status_condition(tmp_path: Path, hosts: str) -> None:
    path = write(tmp_path, f"hosts:\n  {hosts}\n")
    with pytest.raises(ValidationError, match=r"\[STATUS\]"):
        load_config(path)


def test_status_condition_is_only_required_for_http(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: srv
            url: icmp://srv
            services:
              - {name: db, url: 'tcp://srv:5432'}
              - {name: web, url: 'https://example.org', conditions: ['[STATUS] == 200']}
        """,
    )
    (host,) = load_config(path).hosts
    assert [s.name for s in host.services] == ["db", "web"]


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


def test_physical_host_contains_services_and_vm_hosts(tmp_path: Path) -> None:
    (nas,) = load_config(write(tmp_path, VM_CONFIG)).hosts
    (vm,) = nas.vm_hosts
    assert [s.id for s in nas.services] == ["nas-ssh"]
    assert vm.id == "nas-vm"
    assert [s.id for s in vm.services] == ["nas-vm-web"]
    # A vm-host is a host of its own: its services belong to it, not to the physical host.
    assert vm.services[0].host_id == "nas-vm"
    assert vm.host_id is None


def test_each_endpoint_knows_its_kind_and_parent(tmp_path: Path) -> None:
    config = load_config(write(tmp_path, VM_CONFIG))
    assert [(e.id, e.kind, e.parent_id) for e in config.endpoints] == [
        ("nas", "physical", None),
        ("nas-ssh", "service", None),
        ("nas-vm", "vm", "nas"),
        ("nas-vm-web", "service", None),
    ]


def test_endpoints_lists_each_host_before_its_services(tmp_path: Path) -> None:
    config = load_config(write(tmp_path, VM_CONFIG))
    assert [e.id for e in config.endpoints] == ["nas", "nas-ssh", "nas-vm", "nas-vm-web"]


def test_vm_host_cannot_contain_vm_hosts(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: nas
            url: icmp://nas
            vm-hosts:
              - name: vm
                url: icmp://vm
                vm-hosts:
                  - {name: nested, url: 'icmp://nested'}
        """,
    )
    with pytest.raises(ValidationError, match="vm-hosts"):
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
