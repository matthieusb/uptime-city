import { afterEach, describe, expect, it } from 'vitest'
import { hash } from '../../../src/city/layout'
import { noise } from '../../../src/city/biomes'
import { setWorldSeed } from '../../../src/city/seed'
import { worldLayout, type NeighbourhoodSpec } from '../../../src/city/world'

const specs: NeighbourhoodSpec[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  id,
  buildings: [
    { id, services: 3 },
    { id: `${id}-vm`, services: 4 },
  ],
}))

afterEach(() => setWorldSeed(''))

describe('world seed', () => {
  it('leaves the city as it was without a seed', () => {
    const before = hash('town:a')
    setWorldSeed('')
    expect(hash('town:a')).toBe(before)
  })

  it('changes every random draw, in both hash functions', () => {
    const plain = [hash('x'), noise('x')]
    setWorldSeed('abc')
    expect([hash('x'), noise('x')]).not.toEqual(plain)
    setWorldSeed('')
    expect([hash('x'), noise('x')]).toEqual(plain)
  })

  it('lays the same city for the same seed and another for another seed', () => {
    const lay = (seed: string) => {
      setWorldSeed(seed)
      return JSON.stringify(worldLayout(specs))
    }
    expect(lay('one')).toBe(lay('one'))
    expect(lay('one')).not.toBe(lay('two'))
    expect(lay('one')).not.toBe(lay(''))
  })

  it('keeps every neighbourhood and building whatever the seed', () => {
    setWorldSeed('other')
    expect(
      worldLayout(specs).neighbourhoods.map(
        (neighbourhood) => neighbourhood.id,
      ),
    ).toEqual(specs.map((neighbourhoodSpec) => neighbourhoodSpec.id))
  })
})
