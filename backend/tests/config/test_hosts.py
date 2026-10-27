from pathlib import Path

import pytest
from pydantic import ValidationError

from tests.config.helpers import VM_CONFIG, write
from uptime_city.config.loader import load_config


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


def test_physical_host_contains_services_and_vm_hosts(tmp_path: Path) -> None:
    (nas,) = load_config(write(tmp_path, VM_CONFIG)).hosts
    (vm_host,) = nas.vm_hosts
    assert [service.id for service in nas.services] == ["nas-ssh"]
    assert vm_host.id == "nas-vm"
    assert [service.id for service in vm_host.services] == ["nas-vm-web"]
    # A vm-host is a host of its own: its services belong to it, not to the physical host.
    assert vm_host.services[0].host_id == "nas-vm"
    assert vm_host.host_id is None


def test_each_endpoint_knows_its_kind_and_parent(tmp_path: Path) -> None:
    config = load_config(write(tmp_path, VM_CONFIG))
    assert [(endpoint.id, endpoint.kind, endpoint.parent_id) for endpoint in config.endpoints] == [
        ("nas", "physical", None),
        ("nas-ssh", "service", None),
        ("nas-vm", "vm", "nas"),
        ("nas-vm-web", "service", None),
    ]


def test_endpoints_lists_each_host_before_its_services(tmp_path: Path) -> None:
    config = load_config(write(tmp_path, VM_CONFIG))
    assert [endpoint.id for endpoint in config.endpoints] == [
        "nas",
        "nas-ssh",
        "nas-vm",
        "nas-vm-web",
    ]


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


def test_the_same_service_name_is_allowed_under_two_hosts(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        """
        hosts:
          - name: a
            url: icmp://a
            services:
              - {name: ssh, url: 'tcp://a:22'}
          - name: b
            url: icmp://b
            services:
              - {name: ssh, url: 'tcp://b:22'}
        """,
    )
    ids = [endpoint.id for endpoint in load_config(path).endpoints]
    assert ids == ["a", "a-ssh", "b", "b-ssh"]
