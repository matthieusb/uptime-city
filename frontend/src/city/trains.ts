// Pure logic of the trains, independent of three.js. A train comes in at one edge of the map, runs
// the whole railway on the track of its way (see `trackPoint`) and goes out at the other edge; the
// next one comes later, the other way. How often one comes follows the density of the vehicles. A
// train is a locomotive and carriages, coupled in order, and spans several plates: each carriage
// is placed on its own, with the fade of the cars at the edges.
import { hash } from './layout'
import { trackPoint, type Track } from './tracks'
import { SPEED as CAR_SPEED } from './traffic'

export type CarriageKind =
  | 'locomotive'
  | 'coach'
  | 'boxcar'
  | 'tank'
  | 'hopper'
  | 'flatcar'
  // The power car at each end of a TGV, and its articulated coaches.
  | 'tgvHead'
  | 'tgvCoach'

export interface Carriage {
  kind: CarriageKind
  // Along the train.
  length: number
  // The color of the body, and of its stripe or second container.
  body: string
  accent: string
  // The rear power car of a TGV, which heads the other way.
  reversed?: boolean
}

export interface Train {
  // The number of the train: even ones run one way, odd ones the other.
  id: number
  // Whether it is a TGV: streamlined, and much faster than the others.
  tgv: boolean
  dir: 1 | -1
  // Tiles per second.
  speed: number
  // When its head is at the edge it comes in at, in seconds.
  departs: number
  carriages: Carriage[]
  // The space between two coupled carriages.
  coupling: number
  // From the front of the locomotive to the back of the last carriage.
  length: number
  // How far behind the front of the train the middle of each carriage is.
  behind: number[]
}

// The seconds between two trains at the normal density.
export const PERIOD = 60
// How far in from the edges of the map a carriage fades in and out, as cars do.
export const FADE = 4
// The space between two coupled carriages.
export const COUPLING = 0.25
// The space between two carriages of a TGV, which are articulated.
export const TGV_COUPLING = 0.05
// How many times faster than the cars the trains go, and the TGV.
export const TRAIN_FACTOR = 2
export const TGV_FACTOR = 5
// Tiles per second, for the other trains and for a TGV: a multiple of the speed of the cars.
const SPEED = CAR_SPEED.map((v) => v * TRAIN_FACTOR)
export const TGV_SPEED = CAR_SPEED.map((v) => v * TGV_FACTOR)
// About one train in this many is a TGV.
export const TGV_ONE_IN = 4
// No train is longer than this.
const LONGEST = 60
// The first train comes a little after the start, not at once.
const FIRST = 0.1

// The seconds between two trains: none ever when there is no vehicle.
export function trainPeriod(density: number): number {
  return density > 0 ? PERIOD / density : Infinity
}

const LOCOMOTIVE_LENGTH = 3.6
export const LENGTHS: Record<CarriageKind, number> = {
  locomotive: LOCOMOTIVE_LENGTH,
  coach: 3.2,
  boxcar: 3,
  tank: 3,
  hopper: 3,
  flatcar: 3.2,
  tgvHead: 3.8,
  tgvCoach: 3,
}

const LOCOMOTIVES = ['#c0392b', '#2c6fbb', '#e0a800', '#2f7d4f', '#6a4c93']
const COACHES = ['#d8dde3', '#e8e2c8', '#c9d6e3']
const STRIPES = ['#c0392b', '#2c6fbb', '#2f7d4f', '#e0a800']
const FREIGHT = [
  '#b5532f',
  '#2f5d8c',
  '#4a7a3a',
  '#d4a437',
  '#7a7d82',
  '#8c3b3b',
  '#e8e8e8',
  '#5b4b8a',
]
const FREIGHT_KINDS: CarriageKind[] = ['boxcar', 'tank', 'hopper', 'flatcar']

// Whether train `id` is a TGV: about one in four, whatever the density.
export const isTgv = (id: number) => hash(`train:${id}:tgv`) % TGV_ONE_IN === 0

// The livery of a TGV: a white or blue-grey body with an orange, red or dark blue stripe.
const TGV_BODIES = ['#eef1f5', '#b9c6d6']
const TGV_STRIPES = ['#e8731a', '#c8281e', '#1f3a6e']

const pick = <T>(list: readonly T[], h: number) => list[h % list.length]

// What train `id` is made of: a passenger train, a freight train, or a freight train with a few
// coaches at its head. A locomotive always comes first.
export function consist(id: number): Carriage[] {
  const h = (tag: string) => hash(`train:${id}:${tag}`)
  if (isTgv(id)) {
    // A power car at each end, 6 to 8 coaches between.
    const body = pick(TGV_BODIES, h('tgv-body'))
    const accent = pick(TGV_STRIPES, h('tgv-stripe'))
    const car = (kind: CarriageKind, reversed = false): Carriage => ({
      kind,
      length: LENGTHS[kind],
      body,
      accent,
      ...(reversed ? { reversed } : {}),
    })
    return [
      car('tgvHead'),
      ...Array.from({ length: 6 + (h('tgv-n') % 3) }, () => car('tgvCoach')),
      car('tgvHead', true),
    ]
  }
  const kinds: CarriageKind[] = ['locomotive']
  const style = h('style') % 3
  const stripe = pick(STRIPES, h('stripe'))
  const coach = pick(COACHES, h('coach'))
  const freight = (n: number) => {
    for (let i = 0; i < n; i++) {
      kinds.push(pick(FREIGHT_KINDS, h(`kind:${i}`) >>> 4))
    }
  }
  if (style === 0) {
    for (let i = 0; i < 6 + (h('n') % 4); i++) kinds.push('coach')
  } else if (style === 1) {
    freight(9 + (h('n') % 6))
  } else {
    for (let i = 0; i < 2 + (h('c') % 2); i++) kinds.push('coach')
    freight(5 + (h('n') % 4))
  }
  return kinds.map((kind, i): Carriage => {
    const body =
      kind === 'locomotive'
        ? pick(LOCOMOTIVES, h('loco'))
        : kind === 'coach'
          ? coach
          : pick(FREIGHT, h(`color:${i}`))
    const accent =
      kind === 'locomotive' || kind === 'coach'
        ? stripe
        : pick(FREIGHT, h(`accent:${i}`) >>> 3)
    return { kind, length: LENGTHS[kind], body, accent }
  })
}

interface Profile {
  tgv: boolean
  speed: number
  carriages: Carriage[]
  coupling: number
  length: number
  behind: number[]
}

const profiles = new Map<number, Profile>()

// What train `id` is, apart from when it departs: constant for the number.
function profileOf(id: number): Profile {
  const known = profiles.get(id)
  if (known) return known
  const carriages = consist(id)
  const tgv = isTgv(id)
  const coupling = tgv ? TGV_COUPLING : COUPLING
  const behind: number[] = []
  let front = 0
  for (const carriage of carriages) {
    behind.push(front + carriage.length / 2)
    front += carriage.length + coupling
  }
  const h = hash(`train:${id}:speed`)
  const [slow, fast] = tgv ? TGV_SPEED : SPEED
  const profile = {
    tgv,
    speed: slow + (fast - slow) * ((h % 89) / 89),
    carriages,
    coupling,
    length: front - coupling,
    behind,
  }
  profiles.set(id, profile)
  return profile
}

// The departure times of the trains, by number, for a density and a railway length. Train `id` runs
// the same way as `id - 2`, so it leaves at its turn (`id` periods after the start) unless that would
// let it catch up with, or start on, the train before it on its track: a TGV is much faster, and
// follows a slow train only once the slow one is far enough ahead. It changes nothing on a map of a
// usual size.
const schedules = new Map<string, number[]>()

function departure(id: number, density: number, trackLength: number): number {
  const key = `${density}:${trackLength}`
  let list = schedules.get(key)
  if (!list) {
    if (schedules.size > 16) schedules.clear()
    list = []
    schedules.set(key, list)
  }
  while (list.length <= id) {
    const n = list.length
    const turn = (n + FIRST) * trainPeriod(density)
    if (n < 2) {
      list.push(turn)
      continue
    }
    const [prev, me] = [profileOf(n - 2), profileOf(n)]
    // It comes out of the far edge only after the train before has left, and goes in once the train
    // before is wholly in.
    const clear = Math.max(
      (trackLength + prev.length) / prev.speed - trackLength / me.speed,
      (prev.length + 1) / prev.speed,
    )
    list.push(Math.max(turn, list[n - 2] + clear))
  }
  return list[id]
}

// Train `id`, at the given density: it departs about `id` periods after the start, and runs one way
// or the other by turns. `trackLength` is the length of the railway, for the trains to keep apart.
export function trainOf(id: number, density: number, trackLength = 0): Train {
  return {
    id,
    dir: id % 2 === 0 ? 1 : -1,
    departs: departure(id, density, trackLength),
    ...profileOf(id),
  }
}

// The seconds a train takes, from its head coming in to its tail going out.
export const duration = (train: Train, trackLength: number) =>
  (trackLength + train.length) / train.speed

// The trains that are on their way `t` seconds after the start, the oldest first. None at density 0.
export function activeTrains(
  t: number,
  density: number,
  trackLength: number,
): Train[] {
  const period = trainPeriod(density)
  if (!Number.isFinite(period)) return []
  // None leaves before its turn, and none lasts longer than this.
  const newest = Math.floor(t / period - FIRST)
  const longest = (trackLength + LONGEST) / SPEED[0]
  const trains: Train[] = []
  let late = 0
  for (let id = newest; id >= 0 && late < 2; id--) {
    const train = trainOf(id, density, trackLength)
    // Trains of one way leave in order: two old ones in a row, and there are no more.
    late = train.departs + longest < t ? late + 1 : 0
    if (
      t >= train.departs &&
      t <= train.departs + duration(train, trackLength)
    ) {
      trains.unshift(train)
    }
  }
  return trains
}

export interface CarriageState {
  // Whether it is on the railway at all.
  active: boolean
  // How far it is from the edge it came in at.
  u: number
  // 0 to 1: it fades in as it comes in and out as it goes out.
  opacity: number
}

// Carriage `j` of a train, `t` seconds after the start.
export function carriageState(
  train: Train,
  j: number,
  t: number,
  trackLength: number,
): CarriageState {
  const u = train.speed * (t - train.departs) - train.behind[j]
  if (u <= 0 || u >= trackLength) return { active: false, u, opacity: 0 }
  const opacity = Math.min(1, u / FADE, (trackLength - u) / FADE)
  return { active: true, u, opacity: Math.max(0, opacity) }
}

export const trackLength = (track: Track) => track.to - track.from

// Where a carriage at `u` of a train is, and where it heads.
export function carriagePoint(
  track: Track,
  train: Train,
  u: number,
): { x: number; z: number; heading: number } {
  return trackPoint(track, train.dir, u)
}
