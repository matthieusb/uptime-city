import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { BUILDING_WIDTH, hash, seededRandom } from './layout'

// Pixels per tile of wall.
const PX_PER_TILE = 8
const WALLS = ['#d9c5a0', '#c7d3dd', '#e0b0a0', '#b8c4a8', '#d6d6d6']
const WINDOW_DARK = '#2b3a55'
const WINDOW_LIT = '#ffe08a'
const DOOR = '#5a3e2b'

// Pixel art facade of one floor, stable for a given building: the same wall
// color on every floor, and a door on the ground floor.
export function floorTexture(
  id: string,
  floor: number,
  height: number,
): CanvasTexture {
  const building = seededRandom(hash(`facade:${id}`))
  const random = seededRandom(hash(`facade:${id}:${floor}`))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(BUILDING_WIDTH * PX_PER_TILE)
  canvas.height = Math.round(height * PX_PER_TILE)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = WALLS[Math.floor(building() * WALLS.length)]
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgb(0 0 0 / 0.15)'
  ctx.fillRect(0, canvas.height - 1, canvas.width, 1)
  if (floor === 0) {
    ctx.fillStyle = DOOR
    ctx.fillRect(11, 5, 4, canvas.height - 5)
    for (const x of [2, 20]) {
      ctx.fillStyle = random() < 0.5 ? WINDOW_LIT : WINDOW_DARK
      ctx.fillRect(x, 6, 4, 6)
    }
  } else {
    for (const x of [3, 11, 19]) {
      ctx.fillStyle = random() < 0.35 ? WINDOW_LIT : WINDOW_DARK
      ctx.fillRect(x, 4, 4, 6)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  return texture
}

// Labels are drawn at twice their size, to stay sharp on hi-dpi screens.
const LABEL_SCALE = 2
const LABEL_FONT_PX = 11
const LABEL_PADDING_PX = 4

export interface LabelTexture {
  texture: CanvasTexture
  // The badges that breathe, drawn apart on a layer of the same size.
  pulse?: CanvasTexture
  // Size on screen, in CSS pixels.
  width: number
  height: number
}

export interface Badge {
  text: string
  color: string
  // Defaults to the dark of the page.
  textColor?: string
  // Breathes, like the services it counts.
  pulse?: boolean
}

const BADGE_FONT_PX = 9
const BADGE_GAP_PX = 5

// White text on a dark plate, like the 2D tooltips, with small colored badges
// after it.
export function labelTexture(
  text: string,
  badge?: Badge | Badge[],
): LabelTexture {
  const badges = badge === undefined ? [] : [badge].flat()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `${LABEL_FONT_PX * LABEL_SCALE}px monospace`
  const badgeFont = `bold ${BADGE_FONT_PX * LABEL_SCALE}px monospace`
  ctx.font = font
  const textWidth = Math.ceil(ctx.measureText(text).width / LABEL_SCALE)
  ctx.font = badgeFont
  const badgeWidths = badges.map(
    (b) => Math.ceil(ctx.measureText(b.text).width / LABEL_SCALE) + 6,
  )
  const gap = (first: boolean) => (first && !text ? 0 : BADGE_GAP_PX)
  const width =
    textWidth +
    badgeWidths.reduce((sum, w, i) => sum + gap(i === 0) + w, 0) +
    2 * LABEL_PADDING_PX
  const height = LABEL_FONT_PX + 2 * LABEL_PADDING_PX
  canvas.width = width * LABEL_SCALE
  canvas.height = height * LABEL_SCALE
  // The breathing badges are on a layer of their own, to fade it alone.
  const layer = badges.some((b) => b.pulse)
    ? document.createElement('canvas')
    : null
  if (layer) {
    layer.width = canvas.width
    layer.height = canvas.height
  }
  // Resizing the canvas resets its context.
  // Badges alone sit straight on the scene, without the plate.
  if (text) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.6)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, LABEL_PADDING_PX * LABEL_SCALE, canvas.height / 2)
  let at = LABEL_PADDING_PX + textWidth
  badges.forEach((b, i) => {
    at += gap(i === 0)
    const x = at * LABEL_SCALE
    const badgeHeight = (BADGE_FONT_PX + 4) * LABEL_SCALE
    const draw = (b.pulse && layer?.getContext('2d')) || ctx
    draw.fillStyle = b.color
    draw.beginPath()
    draw.roundRect(
      x,
      (canvas.height - badgeHeight) / 2,
      badgeWidths[i] * LABEL_SCALE,
      badgeHeight,
      badgeHeight / 2,
    )
    draw.fill()
    draw.font = badgeFont
    draw.fillStyle = b.textColor ?? '#0f1115'
    draw.textAlign = 'center'
    draw.textBaseline = 'middle'
    draw.fillText(
      b.text,
      x + (badgeWidths[i] * LABEL_SCALE) / 2,
      canvas.height / 2 + 1,
    )
    at += badgeWidths[i]
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  let pulse: CanvasTexture | undefined
  if (layer) {
    pulse = new CanvasTexture(layer)
    pulse.colorSpace = SRGBColorSpace
  }
  return { texture, pulse, width, height }
}
