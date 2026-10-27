// The effects of the map that the effect menu turns on and off.
export type EffectKind = 'clouds' | 'vehicles' | 'animations' | 'borders'

export interface EffectInfo {
  kind: EffectKind
  // As shown in the menu.
  name: string
}

// Animations stand for all the one-off animations, such as the missile that
// nukes a neighbourhood: any new one obeys them.
export const EFFECT_KINDS: EffectInfo[] = [
  { kind: 'clouds', name: 'Clouds' },
  { kind: 'vehicles', name: 'Vehicles' },
  { kind: 'animations', name: 'Animations' },
  { kind: 'borders', name: 'Borders' },
]

// Every effect shows at first.
export const DEFAULT_EFFECTS: ReadonlySet<EffectKind> = new Set(
  EFFECT_KINDS.map((effectInfo) => effectInfo.kind),
)

// How many vehicles and clouds there are, as a multiple of the normal count: the density menu's
// sliders go from none to twice as many.
export type DensityKind = 'vehicles' | 'clouds'
export type Densities = Record<DensityKind, number>

export const DENSITY_MIN = 0
export const DENSITY_MAX = 2
export const DENSITY_STEP = 0.25
export const DEFAULT_DENSITIES: Densities = { vehicles: 1, clouds: 1 }

export const DENSITY_KINDS: { kind: DensityKind; name: string }[] = [
  { kind: 'vehicles', name: 'Vehicles' },
  { kind: 'clouds', name: 'Clouds' },
]
