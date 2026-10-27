from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI

from uptime_city import cli
from uptime_city.cli import parse_args
from uptime_city.config.models import Config, PhysicalHost, StorageConfig


def test_server_listens_on_localhost_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("UPTIME_CITY_HOST", raising=False)
    monkeypatch.delenv("UPTIME_CITY_PORT", raising=False)
    args = parse_args([])
    assert (args.host, args.port) == ("127.0.0.1", 8000)


def test_server_address_can_be_set_by_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPTIME_CITY_HOST", "0.0.0.0")
    monkeypatch.setenv("UPTIME_CITY_PORT", "9000")
    args = parse_args([])
    assert (args.host, args.port) == ("0.0.0.0", 9000)


def test_server_address_flags_override_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPTIME_CITY_HOST", "0.0.0.0")
    args = parse_args(["--host", "10.0.0.5", "--port", "8123"])
    assert (args.host, args.port) == ("10.0.0.5", 8123)


@pytest.mark.parametrize("flag", ["--simulate", "-s"])
def test_simulate_option(flag: str) -> None:
    assert parse_args([flag]).simulate is True
    assert parse_args([]).simulate is False


@pytest.mark.parametrize("value", ["1", "true", "True", "yes", "on"])
def test_simulation_mode_env_enables_the_simulation(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SIMULATION_MODE", value)
    assert parse_args([]).simulate is True


@pytest.mark.parametrize("value", ["", "0", "false", "no", "off"])
def test_simulation_mode_env_falsy_values_keep_it_off(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SIMULATION_MODE", value)
    assert parse_args([]).simulate is False


def test_simulation_mode_env_unset_keeps_it_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIMULATION_MODE", raising=False)
    assert parse_args([]).simulate is False


def test_run_serves_the_app_on_the_given_host_and_port(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config = Config(
        storage=StorageConfig(type="memory"), hosts=[PhysicalHost(name="srv", url="icmp://srv")]
    )
    load = MagicMock(return_value=config)
    serve = MagicMock()
    monkeypatch.setattr(cli, "load_config", load)
    monkeypatch.setattr(cli.uvicorn, "run", serve)
    monkeypatch.delenv("SIMULATION_MODE", raising=False)
    path = tmp_path / "config.yaml"
    monkeypatch.setattr(
        "sys.argv", ["uptime-city", "--config", str(path), "--host", "0.0.0.0", "--port", "9100"]
    )

    cli.run()

    load.assert_called_once_with(path)
    serve.assert_called_once()
    (app,) = serve.call_args.args
    assert isinstance(app, FastAPI)
    assert serve.call_args.kwargs == {"host": "0.0.0.0", "port": 9100}
    assert app.state.monitor.simulation_control is None


def test_run_simulates_with_the_simulate_flag(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config = Config(
        storage=StorageConfig(type="memory"), hosts=[PhysicalHost(name="srv", url="icmp://srv")]
    )
    serve = MagicMock()
    monkeypatch.setattr(cli, "load_config", MagicMock(return_value=config))
    monkeypatch.setattr(cli.uvicorn, "run", serve)
    monkeypatch.setattr("sys.argv", ["uptime-city", "--config", str(tmp_path / "c.yaml"), "-s"])

    cli.run()

    (app,) = serve.call_args.args
    assert app.state.monitor.simulation_control is not None


@pytest.mark.xfail(
    strict=True,
    reason="a non-numeric UPTIME_CITY_PORT raises a raw ValueError instead of an argparse error",
)
def test_a_non_numeric_port_in_the_env_is_a_clear_command_line_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("UPTIME_CITY_PORT", "eighty")
    with pytest.raises(SystemExit) as exit_info:
        parse_args([])
    assert exit_info.value.code == 2
    assert "UPTIME_CITY_PORT" in capsys.readouterr().err


def test_a_non_numeric_port_flag_is_an_argparse_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("UPTIME_CITY_PORT", raising=False)
    with pytest.raises(SystemExit) as exit_info:
        parse_args(["--port", "eighty"])
    assert exit_info.value.code == 2
    assert "--port" in capsys.readouterr().err
