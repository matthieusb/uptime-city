// The one-off events of the floors of a building (a service that came back up, one that went
// down), kept in lists that are read every frame: nothing here allocates unless the list changes.
export interface FloorEvent {
  floor: number
  // A clock time, in seconds.
  start: number
}

// How strong an effect of `curve` is on a floor `t` seconds into the clock: the strongest of its
// events, 0 for a floor with none.
export function flashOf(
  events: readonly FloorEvent[],
  floor: number,
  t: number,
  curve: (age: number) => number,
): number {
  let flash = 0
  for (const event of events) {
    if (event.floor === floor) flash = Math.max(flash, curve(t - event.start))
  }
  return flash
}

// The events plus one starting at `t` for each floor, a floor that already has one starting over.
export function pushFloors(
  events: FloorEvent[],
  floors: readonly number[],
  t: number,
): FloorEvent[] {
  if (floors.length === 0) return events
  return [
    ...events.filter((event) => !floors.includes(event.floor)),
    ...floors.map((floor) => ({ floor, start: t })),
  ]
}

// The events that are still going: the same list when all are.
export function prune(
  events: FloorEvent[],
  t: number,
  active: (age: number) => boolean,
): FloorEvent[] {
  if (events.every((event) => active(t - event.start))) return events
  return events.filter((event) => active(t - event.start))
}
