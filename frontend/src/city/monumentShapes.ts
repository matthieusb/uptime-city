// The drawing of every monument, independent of three.js: lists of colored boxes in the frame of
// the monument (its middle at x = 0 and z = 0, y up from the ground), each within the footprint of
// its size (7, 11 or 15 tiles). Voxel art, so towers are stacks of slabs and curves are rings of
// boxes.
import type { MonumentKind } from './monuments'

export interface Part {
  color: string
  // The middle of the box.
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

type Builder = (b: Tools) => void

interface Tools {
  // A box from y0 up by h, centered on (x, z).
  block: (
    color: string,
    x: number,
    z: number,
    sx: number,
    sz: number,
    y0: number,
    h: number,
  ) => void
  // Slabs from y0 up by h in all, from a width of w0 (and depth d0) to w1 (and d1).
  taper: (
    color: string | ((i: number) => string),
    x: number,
    z: number,
    w0: number,
    w1: number,
    y0: number,
    h: number,
    steps: number,
    d0?: number,
    d1?: number,
  ) => void
  // Four posts at the corners of a square of side 2 * off.
  posts: (
    color: string,
    x: number,
    z: number,
    off: number,
    size: number,
    y0: number,
    h: number,
  ) => void
  // Points on an ellipse, from angle `from` (turns) to `to`.
  ring: (
    n: number,
    rx: number,
    rz: number,
    from?: number,
    to?: number,
  ) => [number, number][]
}

function make(fn: Builder): Part[] {
  const parts: Part[] = []
  const block: Tools['block'] = (color, x, z, sx, sz, y0, h) => {
    parts.push({ color, x, y: y0 + h / 2, z, sx, sy: h, sz })
  }
  const taper: Tools['taper'] = (
    color,
    x,
    z,
    w0,
    w1,
    y0,
    h,
    steps,
    d0 = w0,
    d1 = w1,
  ) => {
    const slab = h / steps
    for (let i = 0; i < steps; i++) {
      const t = steps > 1 ? i / (steps - 1) : 0
      block(
        typeof color === 'string' ? color : color(i),
        x,
        z,
        w0 + (w1 - w0) * t,
        d0 + (d1 - d0) * t,
        y0 + i * slab,
        slab,
      )
    }
  }
  const posts: Tools['posts'] = (color, x, z, off, size, y0, h) => {
    for (const dx of [-off, off]) {
      for (const dz of [-off, off])
        block(color, x + dx, z + dz, size, size, y0, h)
    }
  }
  const ring: Tools['ring'] = (n, rx, rz, from = 0, to = 1) =>
    Array.from({ length: n }, (_, k) => {
      const angle = 2 * Math.PI * (from + ((to - from) * k) / n)
      return [rx * Math.cos(angle), rz * Math.sin(angle)] as [number, number]
    })
  fn({ block, taper, posts, ring })
  return parts
}

const WHITE = '#f4f1ea'
const WATER = '#6fb0d8'
const GOLD = '#f0b429'

const SHAPES: Record<MonumentKind, Builder> = {
  // ---- Small, 7 tiles ----
  'statue-of-liberty': ({ block, taper }) => {
    block('#b8b4a8', 0, 0, 5, 5, 0, 0.4)
    block('#c9c5b8', 0, 0, 3, 3, 0.4, 1.2)
    block('#b8b4a8', 0, 0, 2.2, 2.2, 1.6, 0.4)
    taper('#6fb3a0', 0, 0, 1.5, 0.8, 2, 2.4, 4)
    block('#6fb3a0', 0, 0, 0.7, 0.7, 4.4, 0.4)
    for (const dx of [-0.3, -0.15, 0, 0.15, 0.3]) {
      block('#6fb3a0', dx, 0, 0.1, 0.1, 4.8, 0.4)
    }
    block('#6fb3a0', 0.5, 0, 0.3, 0.3, 4.4, 1.5)
    block(GOLD, 0.5, 0, 0.35, 0.35, 5.9, 0.5)
  },
  'big-ben': ({ block, taper }) => {
    block('#cdbb86', -0.6, 2, 5.2, 1.6, 0, 1.2)
    block('#d8c28a', 0, 0, 2.2, 2.2, 0, 3.6)
    block('#c9b27a', 0, 0, 2.4, 2.4, 3.6, 0.4)
    block('#d8c28a', 0, 0, 2.2, 2.2, 4, 1.2)
    for (const [dx, dz] of [
      [1.16, 0],
      [-1.16, 0],
      [0, 1.16],
      [0, -1.16],
    ]) {
      const wide = dx === 0
      block(WHITE, dx, dz, wide ? 1.3 : 0.06, wide ? 0.06 : 1.3, 4.1, 1.1)
      block('#2b2b33', dx, dz, wide ? 0.5 : 0.07, wide ? 0.07 : 0.5, 4.5, 0.3)
    }
    taper('#4a5a62', 0, 0, 2.4, 0.4, 5.2, 1.8, 5)
    block(GOLD, 0, 0, 0.1, 0.1, 7, 0.6)
  },
  'pisa-tower': ({ block }) => {
    block('#cfc9b6', 0, 0, 3.6, 3.6, 0, 0.15)
    for (let i = 0; i < 8; i++) {
      const lean = -0.5 + i * 0.14
      block(i % 2 ? '#e4dfd0' : WHITE, lean, 0, 2.2, 2.2, 0.15 + i * 0.7, 0.7)
      block('#b8b2a0', lean, 0, 2.3, 2.3, 0.15 + i * 0.7 + 0.6, 0.1)
    }
    block('#d8d2c0', 0.4, 0, 1.5, 1.5, 5.75, 0.8)
    block('#9a8f78', 0.4, 0, 1.7, 1.7, 6.55, 0.15)
  },
  'arc-de-triomphe': ({ block }) => {
    block('#b9b2a0', 0, 0, 6.4, 5, 0, 0.15)
    for (const dx of [-1.8, 1.8]) block('#d6cdb4', dx, 0, 1.4, 3, 0.15, 4)
    block('#d6cdb4', 0, 0, 5, 3, 3.1, 1.1)
    block('#c9bfa4', 0, 0, 5.4, 3.2, 4.2, 0.7)
    block('#b3a98c', 0, 1.55, 4.8, 0.06, 4.25, 0.5)
    block('#d6cdb4', 0, 0, 1, 1.4, 3.5, 0.2)
    for (const dz of [-1.2, 1.2]) block('#9a9078', 0, dz, 2.2, 0.15, 0.15, 3)
  },
  'brandenburg-gate': ({ block }) => {
    block('#bdb7a6', 0, 0, 6.4, 2.6, 0, 0.3)
    for (let k = 0; k < 6; k++) {
      for (const dz of [-0.9, 0.9]) {
        block('#e6dfcb', -2.5 + k, dz, 0.45, 0.45, 0.3, 2.9)
      }
    }
    block('#d9d1b8', 0, 0, 6.2, 2.4, 3.2, 0.5)
    block('#cfc6aa', 0, 0, 6.4, 2.6, 3.7, 0.4)
    block('#cfc6aa', 0, 0, 2, 1.4, 4.1, 0.4)
    block('#6fa88a', 0, 0, 1.2, 0.8, 4.5, 0.4)
    for (const dx of [-0.45, -0.15, 0.15, 0.45]) {
      block('#6fa88a', dx, 0.35, 0.22, 0.3, 4.5, 0.7)
    }
    block('#6fa88a', 0, 0, 0.3, 0.3, 4.9, 0.7)
  },
  'christ-the-redeemer': ({ block, taper }) => {
    taper('#8a8a82', 0, 0, 6, 3.2, 0, 1.8, 3)
    block('#d8d4c8', 0, 0, 1.4, 1.4, 1.8, 1.2)
    block('#c9c5b8', 0, 0, 1.7, 1.7, 3, 0.2)
    block('#f4f4f0', 0, 0, 0.7, 0.55, 3.2, 2.2)
    block('#f4f4f0', 0, 0, 3.2, 0.4, 4.6, 0.4)
    block('#f4f4f0', 0, 0, 0.5, 0.5, 5.4, 0.55)
    // The hands, the robe and the stones at the foot of the statue.
    for (const dx of [-1.5, 1.5]) block('#f4f4f0', dx, 0, 0.3, 0.3, 4.3, 0.3)
    block('#e6e3da', 0, 0, 1, 0.7, 3.2, 0.5)
    block('#7f7f78', 2, 1.4, 0.8, 0.8, 0, 0.5)
  },

  // ---- Medium, 11 tiles ----
  'eiffel-tower': ({ block, taper, posts }) => {
    const iron = '#6b5b4b'
    posts(iron, 0, 0, 4, 1.3, 0, 2.4)
    for (const o of [-4, 4]) {
      block(iron, 0, o, 6.7, 0.5, 1.8, 0.5)
      block(iron, o, 0, 0.5, 6.7, 1.8, 0.5)
    }
    block('#8a7867', 0, 0, 7.4, 7.4, 2.4, 0.35)
    posts(iron, 0, 0, 2.2, 1, 2.75, 2.8)
    block('#8a7867', 0, 0, 5.4, 5.4, 5.55, 0.3)
    taper(iron, 0, 0, 2.4, 0.9, 5.85, 3.2, 6)
    block('#8a7867', 0, 0, 1.8, 1.8, 9.05, 0.25)
    block(iron, 0, 0, 0.25, 0.25, 9.3, 1.3)
  },
  'montparnasse-tower': ({ block }) => {
    block('#6b7280', 0, 0, 7, 5, 0, 1)
    for (let i = 0; i < 10; i++) {
      block(i % 2 ? '#4b5a74' : '#2f3b52', 0, 0, 3.6, 2.4, 1 + i * 0.9, 0.9)
    }
    block('#6b7280', 0, 0, 3.2, 2, 10, 0.4)
    block('#9aa4ae', 0, 0, 0.15, 0.15, 10.4, 1.2)
  },
  'one-world-trade-center': ({ block, taper }) => {
    block('#5b6a7a', 0, -1.5, 3.8, 3.8, 0, 2)
    taper('#a9c4d6', 0, -1.5, 3.6, 2.6, 2, 6, 8)
    block('#7e92a3', 0, -1.5, 2, 2, 8, 0.5)
    block('#e5e5e5', 0, -1.5, 0.25, 0.25, 8.5, 3)
    for (const x of [-2.5, 2.5]) {
      block('#44505c', x, 3.2, 3.2, 3.2, 0, 0.1)
      block('#2b4a66', x, 3.2, 2.6, 2.6, 0.05, 0.1)
    }
  },
  'washington-monument': ({ block, taper, ring }) => {
    block('#d8d2c4', 0, -1.5, 3.4, 3.4, 0, 0.3)
    taper('#efece4', 0, -1.5, 1.6, 0.8, 0.3, 7, 8)
    taper('#f8f6f0', 0, -1.5, 0.8, 0.15, 7.3, 1.2, 3)
    for (const [x, z] of ring(8, 2.4, 2.4)) {
      block('#8a8f98', x, z - 1.5, 0.08, 0.08, 0, 1.2)
      block('#c0392b', x + 0.15, z - 1.5, 0.3, 0.05, 0.9, 0.25)
    }
    block('#d8d2c4', 0, 3.1, 3, 4.4, 0, 0.1)
    block(WATER, 0, 3.2, 2.2, 4.2, 0, 0.14)
  },
  'sydney-opera': ({ block }) => {
    block('#d6cfbf', 0, 0, 10.4, 6.4, 0, 0.55)
    const sails = (z: number, depth: number, sizes: number[]) => {
      sizes.forEach((w, k) => {
        for (let i = 0; i < 5; i++) {
          block(
            i % 2 ? '#ebe6d8' : WHITE,
            -3.4 + k * 3.4,
            z - 0.18 * i,
            w * (1 - 0.17 * i),
            depth * (1 - 0.14 * i),
            0.55 + i * 0.75,
            0.75,
          )
        }
      })
    }
    sails(0.8, 2.2, [2.8, 3, 2.6])
    sails(-1.1, 1.5, [2.4, 2.6, 2.2])
    block('#3a5a78', 0, 2.6, 9, 0.5, 0.55, 0.9)
  },
  atomium: ({ block, posts }) => {
    const silver = '#cdd5dc'
    const tube = '#a8b2bc'
    for (const [dx, dz] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ]) {
      block(silver, dx, dz, 1.7, 1.7, 0.9, 1.7)
      block(silver, dx, dz, 1.7, 1.7, 6.4, 1.7)
      block(tube, dx, dz, 0.35, 0.35, 2.6, 3.8)
      for (const t of [0.35, 0.65]) {
        block(
          tube,
          dx * (1 - t),
          dz * (1 - t),
          0.45,
          0.45,
          1.75 + 2.8 * t,
          0.45,
        )
      }
    }
    block(silver, 0, 0, 1.7, 1.7, 3.65, 1.7)
    for (const o of [-3, 3]) {
      for (const y of [1.6, 7.1]) {
        block(tube, 0, o, 4.3, 0.35, y, 0.35)
        block(tube, o, 0, 0.35, 4.3, y, 0.35)
      }
    }
    posts('#6b7280', 0, 0, 3, 0.5, 0, 0.9)
  },
  'space-needle': ({ block, taper, posts }) => {
    for (let i = 0; i < 4; i++) {
      posts('#e8e8ea', 0, 0, 2.4 - 0.5 * i, 0.5, 1.3 * i, 1.3)
    }
    block('#d9dce0', 0, 0, 5.4, 5.4, 5.2, 0.35)
    block('#e8e8ea', 0, 0, 1, 1, 5.55, 2.3)
    block('#f2efe6', 0, 0, 6, 6, 7.85, 0.5)
    block('#355a78', 0, 0, 4.4, 4.4, 8.35, 0.6)
    taper('#f2efe6', 0, 0, 5, 1.2, 8.95, 0.8, 3)
    block('#c0392b', 0, 0, 0.15, 0.15, 9.75, 1.8)
  },
  'tokyo-tower': ({ block, taper, posts }) => {
    for (let j = 0; j < 4; j++) {
      const red = j % 2 === 0
      const color = red ? '#e8512f' : WHITE
      const off = 3.5 - 0.85 * j
      posts(color, 0, 0, off, 1 - 0.2 * j, 1.7 * j, 1.7)
      for (const o of [-off, off]) {
        block(color, 0, o, 2 * off + 0.3, 0.25, 1.7 * j + 1.45, 0.25)
        block(color, o, 0, 0.25, 2 * off + 0.3, 1.7 * j + 1.45, 0.25)
      }
    }
    block('#e8e8e8', 0, 0, 5.4, 5.4, 3.3, 0.4)
    block('#e8e8e8', 0, 0, 2.6, 2.6, 6.5, 0.3)
    taper('#e8512f', 0, 0, 1.2, 0.5, 6.8, 2.2, 3)
    block(WHITE, 0, 0, 0.25, 0.25, 9, 1.8)
  },
  'fourviere-basilica': ({ block, taper }) => {
    block('#7ea05a', 0, 0, 10, 8, 0, 0.5)
    block('#6f9250', 0, 0, 8.6, 6.6, 0.5, 0.5)
    block('#e9e2cf', 0, 0, 5.6, 3, 1, 1.8)
    block('#6a7f8a', 0, 0, 5.8, 3.2, 2.8, 0.3)
    for (const dx of [-2.5, 2.5]) {
      for (const dz of [-1.3, 1.3]) {
        block('#e9e2cf', dx, dz, 1, 1, 1, 2.6)
        taper('#6a7f8a', dx, dz, 1.1, 0.3, 3.6, 0.8, 3)
      }
    }
    taper('#6a7f8a', 0, 0, 2.4, 0.8, 3.1, 1, 3)
    block('#e9e2cf', 3.6, 2.6, 0.8, 0.8, 1, 3.2)
    block(GOLD, 3.6, 2.6, 0.2, 0.2, 4.2, 0.5)
  },
  'tower-bridge': ({ block, taper }) => {
    const stone = '#9aa6b8'
    const blue = '#3a6ea5'
    block(WATER, 0, 0, 4.6, 11, 0, 0.12)
    block(stone, 0, 0, 11, 1.6, 1, 0.35)
    for (const x of [-4.4, 4.4]) block('#8a96a8', x, 0, 2, 2.4, 0, 1)
    for (const x of [-1.7, 1.7]) {
      block(stone, x, 0, 1.5, 1.9, 0, 4.6)
      for (const [dx, dz] of [
        [-0.6, -0.8],
        [0.6, -0.8],
        [-0.6, 0.8],
        [0.6, 0.8],
      ]) {
        block('#8a96a8', x + dx, dz, 0.4, 0.4, 4.6, 0.8)
      }
      taper(blue, x, 0, 1.6, 0.3, 4.6, 1, 3)
    }
    block(blue, 0, 0, 1.9, 1.2, 3.8, 0.4)
    for (const sign of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        for (const dz of [-0.7, 0.7]) {
          block(
            blue,
            sign * (2.7 + 0.55 * k),
            dz,
            0.5,
            0.15,
            3.4 - 0.75 * k,
            0.15,
          )
        }
      }
    }
  },
  'petronas-towers': ({ block, taper }) => {
    block('#9aa4ae', 0, 0, 8, 6, 0, 0.6)
    for (const x of [-1.9, 1.9]) {
      taper((i) => (i % 2 ? '#c7d1da' : '#aeb9c4'), x, 0, 2.8, 1.8, 0.6, 8, 8)
      taper('#d8dee4', x, 0, 1, 0.2, 8.6, 1.5, 3)
      block('#e5e5e5', x, 0, 0.15, 0.15, 10.1, 1.2)
    }
    block('#b0bbc5', 0, 0, 1.2, 1.1, 4.8, 0.4)
  },
  'taj-mahal': ({ block, taper }) => {
    block('#f3efe5', 0, 0, 9.4, 9.4, 0, 0.8)
    block('#fbf8f0', 0, 0, 4.4, 4.4, 0.8, 2.4)
    for (const [dx, dz] of [
      [2.22, 0],
      [-2.22, 0],
      [0, 2.22],
      [0, -2.22],
    ]) {
      const wide = dx === 0
      block('#3a4a5c', dx, dz, wide ? 1 : 0.06, wide ? 0.06 : 1, 1.2, 1.6)
    }
    for (const dx of [-1.8, 1.8]) {
      for (const dz of [-1.8, 1.8]) {
        block('#fbf8f0', dx, dz, 0.7, 0.7, 3.2, 0.9)
        block('#fbf8f0', dx, dz, 0.9, 0.9, 4.1, 0.2)
      }
    }
    taper('#fbf8f0', 0, 0, 3.2, 0.8, 3.2, 2.1, 6)
    block(GOLD, 0, 0, 0.12, 0.12, 5.3, 0.8)
    for (const dx of [-4, 4]) {
      for (const dz of [-4, 4]) {
        block('#fbf8f0', dx, dz, 0.6, 0.6, 0.8, 3.6)
        block('#fbf8f0', dx, dz, 0.8, 0.8, 4.4, 0.3)
      }
    }
    block(WATER, 0, 3.5, 0.9, 1.8, 0.8, 0.06)
  },
  'sagrada-familia': ({ block, taper }) => {
    const sand = '#cdbf9f'
    block(sand, 0, 0.3, 8.4, 4.4, 0, 2.2)
    block('#a89a7a', 0, 0.3, 8.6, 4.6, 2.2, 0.2)
    ;[5.5, 6.5, 6.5, 5.5].forEach((h, k) => {
      const x = -3.3 + 2.2 * k
      block(sand, x, -1.4, 1, 1, 2.4, h - 2.4)
      taper('#e0b84a', x, -1.4, 1.1, 0.3, h, 1.2, 3)
    })
    for (const x of [-2.2, 2.2]) {
      block(sand, x, 1.5, 1, 1, 2.4, 1.6)
      taper('#e0b84a', x, 1.5, 1.1, 0.3, 4, 0.9, 3)
    }
    taper(sand, 0, 0.3, 2.6, 1.4, 2.4, 4, 5)
    taper('#e0b84a', 0, 0.3, 1.4, 0.3, 6.4, 2.6, 4)
    block(WHITE, 0, 0.3, 0.1, 0.1, 9, 0.6)
  },
  stonehenge: ({ block, ring }) => {
    const stone = '#8d8b84'
    const lintel = '#a09d94'
    const around = (n: number, r: number, offset = 0) =>
      ring(n, r, r, offset, 1 + offset)
    around(12, 4.3).forEach(([x, z]) => {
      const sideways = Math.abs(z) > Math.abs(x)
      block(stone, x, z, sideways ? 0.9 : 0.5, sideways ? 0.5 : 0.9, 0, 2)
    })
    around(12, 4.15, 1 / 24).forEach(([x, z]) => {
      const sideways = Math.abs(z) > Math.abs(x)
      block(lintel, x, z, sideways ? 1.7 : 0.6, sideways ? 0.6 : 1.7, 2, 0.35)
    })
    for (const [x, z, alongX] of [
      [0, -2.2, true],
      [-2.3, 1.2, false],
      [2.3, 1.2, false],
    ] as const) {
      for (const d of [-0.8, 0.8]) {
        block(
          stone,
          x + (alongX ? d : 0),
          z + (alongX ? 0 : d),
          0.5,
          0.5,
          0,
          2.8,
        )
      }
      block(lintel, x, z, alongX ? 2.1 : 0.55, alongX ? 0.55 : 2.1, 2.8, 0.4)
    }
    block('#7d7b74', 0, 0.2, 1.2, 0.5, 0, 0.3)
  },
  'burj-al-arab': ({ block, taper }) => {
    block('#e8d9a8', 0, 0, 9, 9, 0, 0.5)
    block('#9a9a9a', 0, 4.9, 0.8, 1.2, 0.3, 0.2)
    block('#e8e8ea', -2, 0, 0.8, 2.4, 0.5, 10)
    taper(
      (i) => (i % 2 ? WHITE : '#e6e2d6'),
      -1.4,
      0,
      3.4,
      0.7,
      0.5,
      9.5,
      10,
      2.2,
      2.2,
    )
    block('#d9d9d9', 1.1, 0, 1.6, 1.6, 6, 0.2)
    block('#c0392b', -2, 0, 0.15, 0.15, 10.5, 1.4)
  },
  parthenon: ({ block, taper }) => {
    const marble = '#e6dfcb'
    block(marble, 0, 0, 10.4, 6.4, 0, 0.2)
    block(marble, 0, 0, 9.6, 5.6, 0.2, 0.2)
    block(marble, 0, 0, 8.8, 4.8, 0.4, 0.2)
    for (let k = 0; k < 8; k++) {
      for (const dz of [-2, 2])
        block('#f1ead6', -3.9 + k * 1.114, dz, 0.5, 0.5, 0.6, 2.4)
    }
    for (const dx of [-3.9, 3.9]) {
      for (const dz of [-1, 0, 1]) block('#f1ead6', dx, dz, 0.5, 0.5, 0.6, 2.4)
    }
    block('#d8d0bb', 0, 0, 5.6, 2.4, 0.6, 2.2)
    block(marble, 0, 0, 9, 5, 3, 0.5)
    for (const dz of [-2.4, 2.4])
      taper(marble, 0, dz, 9, 1.5, 3.5, 1.1, 3, 0.4, 0.4)
    block('#b9714f', 0, 0, 8.4, 4.4, 3.5, 0.3)
  },

  // ---- Big, 15 tiles ----
  'us-congress': ({ block, taper }) => {
    const white = '#f2efe8'
    block('#d8d4c8', 0, 3.4, 7, 1.4, 0, 0.25)
    block(white, 0, -1, 6, 4.6, 0, 2.4)
    for (const x of [-5, 5]) {
      block(white, x, -1.4, 4.2, 3.6, 0, 1.8)
      block('#9aa0a8', x, -1.4, 4.4, 3.8, 1.8, 0.15)
      block('#3a4a5c', x, 0.43, 3.8, 0.05, 0.5, 0.5)
    }
    block('#e9e6dd', 0, -1, 3.4, 3.4, 2.4, 1.2)
    taper('#f7f5ef', 0, -1, 3.4, 0.9, 3.6, 2.6, 6)
    block('#e9e6dd', 0, -1, 0.6, 0.6, 6.2, 0.9)
    block(GOLD, 0, -1, 0.2, 0.2, 7.1, 0.5)
  },
  'vatican-square': ({ block, taper, ring }) => {
    block('#d3cbb8', 0, 0, 14.6, 14.6, 0, 0.1)
    block('#d9d2c0', 0, -4.8, 7, 3, 0.1, 2.6)
    block('#cfc9b8', 0, -4.8, 3, 3, 2.7, 1.4)
    taper('#9aa8a4', 0, -4.8, 3, 0.9, 4.1, 2.4, 6)
    block('#cfc9b8', 0, -4.8, 0.5, 0.5, 6.5, 0.9)
    taper('#c9b99a', 0, 1.5, 0.5, 0.25, 0.1, 2.6, 3)
    for (const [rx, rz] of [
      [6.7, 3.8],
      [6, 3.3],
    ]) {
      for (const [x, z] of ring(28, rx, rz)) {
        if (z < -0.55 * rz) continue
        block('#e0d9c6', x, z + 2.4, 0.45, 0.45, 0.1, 1.6)
      }
    }
  },
  'bellecour-square': ({ block }) => {
    const bronze = '#5f8f77'
    block('#c98a5e', 0, 0, 14.6, 14.6, 0, 0.12)
    block('#d6cfbd', 0, 0, 2.6, 2.6, 0.12, 0.25)
    block('#d6cfbd', 0, 0, 1.4, 1, 0.37, 1.6)
    block(bronze, 0, 0, 1.4, 0.6, 1.97, 0.9)
    block(bronze, 0.1, 0, 0.4, 0.4, 2.87, 0.8)
    for (let x = -6; x <= 6; x += 3) {
      for (const z of [-6.3, 6.3]) {
        block('#6b4a2b', x, z, 0.25, 0.25, 0.12, 0.9)
        block('#4f8f3a', x, z, 1.4, 1.4, 1, 1)
      }
    }
    for (const x of [-4, 4]) {
      block('#d6cfbd', x, 0, 2, 2, 0.12, 0.25)
      block(WATER, x, 0, 1.6, 1.6, 0.2, 0.15)
    }
  },
  colosseum: ({ block, ring }) => {
    block('#e3cf9a', 0, 0, 8, 5.2, 0, 0.12)
    for (let t = 0; t < 3; t++) {
      ring(48, 6.2, 4.6).forEach(([x, z], k) => {
        block(k % 2 ? '#d9c59d' : '#8a7752', x, z, 1.3, 1.3, 1.1 * t, 1.1)
      })
    }
    ring(32, 5, 3.6).forEach(([x, z], k) => {
      block(k % 2 ? '#cdb98c' : '#bfa97a', x, z, 1, 1, 0, 2.2)
    })
    ring(48, 6.2, 4.6).forEach(([x, z]) => {
      block('#d9c59d', x, z, 1.3, 1.3, 3.3, 0.3)
    })
  },
  pyramids: ({ block, taper }) => {
    const sand = (i: number, steps: number) =>
      i >= steps - 2 ? '#f0d99a' : '#e1c07a'
    taper((i) => sand(i, 9), -1.5, -2.5, 7.4, 0.5, 0, 5.4, 9)
    taper((i) => sand(i, 7), 4, -3.2, 4.6, 0.4, 0, 3.4, 7)
    taper((i) => sand(i, 5), 4.6, 2.4, 3, 0.3, 0, 2, 5)
    block('#d9b86a', -4.2, 4.4, 3, 1.1, 0, 0.9)
    block('#d9b86a', -2.8, 4.4, 0.9, 0.9, 0.9, 0.9)
    block('#d9b86a', -2.2, 4.4, 1.2, 0.35, 0, 0.35)
    for (const [x, z] of [
      [-6.5, 1.5],
      [-6.5, -0.5],
    ]) {
      block('#7a5a30', x, z, 0.2, 0.2, 0, 1.6)
      block('#4f8f3a', x, z, 1.2, 1.2, 1.6, 0.2)
    }
  },
  'red-square': ({ block, taper, ring }) => {
    const red = '#a8442e'
    block('#9b9488', 0, 0, 14.6, 14.6, 0, 0.1)
    block(red, 0, -6.8, 14, 0.6, 0.1, 1.6)
    for (const x of [-5, 5]) {
      block(red, x, -6.8, 1.2, 1.2, 0.1, 3)
      taper(red, x, -6.8, 1.4, 0.3, 3.1, 1.2, 3)
    }
    block(red, 0, -6.8, 1.4, 1.4, 0.1, 3.6)
    taper('#2f9e6f', 0, -6.8, 1.4, 0.3, 3.7, 2.2, 4)
    block(GOLD, 0, -6.8, 0.25, 0.25, 5.9, 0.4)
    block('#d9c6b0', -2.5, 5.8, 8, 1.2, 0.1, 1.8)
    block('#9aa0a8', -2.5, 5.8, 8.2, 1.4, 1.9, 0.15)
    const [cx, cz] = [3.8, 1.5]
    block('#b5503a', cx, cz, 1.6, 1.6, 0.1, 3.6)
    taper('#2f9e6f', cx, cz, 1.8, 0.4, 3.7, 1.8, 4)
    block(GOLD, cx, cz, 0.3, 0.3, 5.5, 0.4)
    const colors = ['#c0392b', '#3a6ea5', GOLD, '#2f9e6f', '#c0392b', '#3a6ea5']
    ring(6, 1.9, 1.9).forEach(([x, z], k) => {
      const h = 1.4 + (k % 3) * 0.5
      block('#d9c6b0', cx + x, cz + z, 0.9, 0.9, 0.1, h)
      block(colors[k], cx + x, cz + z, 1, 1, 0.1 + h, 0.5)
      block(colors[k], cx + x, cz + z, 0.6, 0.6, 0.6 + h, 0.4)
      block(GOLD, cx + x, cz + z, 0.15, 0.15, 1 + h, 0.4)
    })
  },
  'mont-saint-michel': ({ block, taper }) => {
    block('#e6d6a8', 0, 0, 14.6, 14.6, 0, 0.08)
    for (const [x, z] of [
      [-5.5, 5.5],
      [5.5, -5.5],
    ]) {
      block(WATER, x, z, 3.2, 3.2, 0, 0.12)
    }
    taper('#8a8478', 0, 0, 9, 5, 0.08, 3.2, 4)
    for (const [x, z, tier] of [
      [-3.6, 2, 0],
      [3.6, 2, 0],
      [-3.6, -2, 0],
      [3.6, -2, 0],
      [-2.2, 3, 0],
      [2.2, 3, 0],
      [-2, -3, 0],
      [2, -3, 0],
      [-2.2, 2, 1],
      [2.2, 2, 1],
    ] as const) {
      const y = 0.08 + tier * 0.8 + 0.8
      block('#d8c7a6', x, z, 0.8, 0.7, y, 0.7)
      block('#8a4b3a', x, z, 0.9, 0.8, y + 0.7, 0.2)
    }
    block('#bfb8a6', 0, 0, 3.2, 1.4, 3.28, 1.2)
    block('#bfb8a6', 0, 0, 1.2, 1.2, 4.48, 1.4)
    taper('#6a7f8a', 0, 0, 1.1, 0.15, 5.88, 2, 5)
    block(GOLD, 0, 0, 0.2, 0.2, 7.88, 0.5)
  },
  'mount-rushmore': ({ block, taper }) => {
    const granite = '#8f8c85'
    block(granite, 0, -2, 13, 5, 0, 2.2)
    block('#85827b', 0, -2.2, 11, 4.4, 2.2, 2)
    block('#7b7871', 0, -2.4, 9, 3.6, 4.2, 1.6)
    for (const x of [-5.5, 5.5]) taper('#85827b', x, -3, 3, 0.5, 0, 4.5, 4)
    for (const x of [-3.6, -1.2, 1.2, 3.6]) {
      block('#c9baa4', x, 0.5, 1.7, 1.2, 2.4, 2.2)
      block('#c9baa4', x, 1.25, 0.3, 0.3, 3.2, 0.4)
      block('#a89a86', x, 0.5, 1.9, 1.3, 4.6, 0.3)
    }
    for (const x of [-6, -3.5, -1, 1.5, 4, 6.5]) {
      block('#6b4a2b', x, 5.5, 0.2, 0.2, 0, 0.4)
      taper('#2f6b3a', x, 5.5, 0.9, 0.2, 0.4, 1.6, 3)
    }
  },
  'mount-fuji': ({ block, taper }) => {
    taper(
      (i) => (i < 5 ? '#5f7aa0' : i < 7 ? '#8fa3bf' : '#f4f6fa'),
      0,
      0,
      14,
      2.2,
      0,
      8,
      10,
    )
    block('#6b6b78', 0, 0, 1.4, 1.4, 8, 0.2)
    for (const [x, z] of [
      [-6.4, 6.4],
      [6.4, 6.4],
      [-6.4, -6.4],
      [6.4, -6.4],
    ]) {
      block('#6b4a2b', x, z, 0.25, 0.25, 0, 0.8)
      block('#f4a6c0', x, z, 1, 1, 0.8, 0.9)
    }
  },
}

const cache = new Map<MonumentKind, Part[]>()

// Every box of a monument, in its own frame, y from the ground.
export function shapeOf(kind: MonumentKind): Part[] {
  let parts = cache.get(kind)
  if (!parts) {
    parts = make(SHAPES[kind])
    cache.set(kind, parts)
  }
  return parts
}
