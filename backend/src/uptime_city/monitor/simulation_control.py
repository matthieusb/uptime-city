import asyncio
from collections.abc import Callable

from uptime_city.monitor.simulation import Action, Simulation
from uptime_city.probes.base import ProbeResult


class SimulationControl:
    """Drives a simulation for the monitor: it is stopped at first, and redraws the simulated
    statuses every period once started. Every set of results is handed to `record`."""

    def __init__(
        self, simulation: Simulation, record: Callable[[dict[str, ProbeResult]], None]
    ) -> None:
        self._simulation = simulation
        self._record = record
        self._restart = asyncio.Event()
        self.running = False

    def _roll(self) -> None:
        self._record(self._simulation.roll())

    def refresh(self) -> None:
        """Redraws the simulated statuses now, and restarts the countdown to the next redraw."""
        self._roll()
        self._simulation.restart()
        self._restart.set()

    def act(self, action: Action, count: int = 1) -> None:
        """Changes the simulated statuses by hand. Only while the simulation is stopped."""
        if self.running:
            raise RuntimeError("the simulation is running")
        self._record(self._simulation.act(action, count))

    def start(self) -> None:
        """Redraws the simulated statuses every period, the countdown starting over."""
        if not self.running:
            self.running = True
            self._simulation.restart()
            self._restart.set()

    def stop(self) -> None:
        """Keeps the simulated statuses as they are until the simulation is started again."""
        self.running = False
        self._restart.set()

    def next_refresh_in_s(self) -> float:
        """Seconds until the next redraw: the full period while the simulation is stopped."""
        if not self.running:
            return self._simulation.period_s
        return self._simulation.next_roll_in_s()

    async def run(self) -> None:
        self._roll()
        while True:
            if not self.running:
                await self._restart.wait()
                self._restart.clear()
                continue
            try:
                await asyncio.wait_for(self._restart.wait(), self._simulation.period_s)
                self._restart.clear()
            except TimeoutError:
                self._roll()
