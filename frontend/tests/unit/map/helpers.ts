import { type NeighbourhoodSpec } from '../../../src/city/world'

// A physical host, with a building for itself and one per vm-host.
export const spec = (id: string, ...vms: number[]): NeighbourhoodSpec => ({
  id,
  buildings: [
    { id, services: 2 },
    ...vms.map((services, i) => ({ id: `${id}-vm${i}`, services })),
  ],
})

export const hosts = [
  spec('a', 3),
  spec('b'),
  spec('c'),
  spec('d'),
  spec('e', 3, 18),
]

// A big homelab, for the biomes to show their spread.
export const big = Array.from({ length: 30 }, (_, i) =>
  spec(`host-${i}`, ...Array.from({ length: i % 4 }, (_, n) => (i + n) % 6)),
)
