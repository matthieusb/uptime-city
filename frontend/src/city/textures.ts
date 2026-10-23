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
  // Size on screen, in CSS pixels.
  width: number
  height: number
}

export interface Badge {
  text: string
  color: string
}

const BADGE_FONT_PX = 9
const BADGE_GAP_PX = 5

// White text on a dark plate, like the 2D tooltips, with a small colored
// badge after it.
export function labelTexture(text: string, badge?: Badge): LabelTexture {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `${LABEL_FONT_PX * LABEL_SCALE}px monospace`
  const badgeFont = `bold ${BADGE_FONT_PX * LABEL_SCALE}px monospace`
  ctx.font = font
  const textWidth = Math.ceil(ctx.measureText(text).width / LABEL_SCALE)
  ctx.font = badgeFont
  const badgeWidth = badge
    ? Math.ceil(ctx.measureText(badge.text).width / LABEL_SCALE) + 6
    : 0
  const width =
    textWidth +
    (badge ? (text ? BADGE_GAP_PX : 0) + badgeWidth : 0) +
    2 * LABEL_PADDING_PX
  const height = LABEL_FONT_PX + 2 * LABEL_PADDING_PX
  canvas.width = width * LABEL_SCALE
  canvas.height = height * LABEL_SCALE
  // Resizing the canvas resets its context.
  // A badge alone sits straight on the scene, without the plate.
  if (text) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.6)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, LABEL_PADDING_PX * LABEL_SCALE, canvas.height / 2)
  if (badge) {
    const gap = text ? BADGE_GAP_PX : 0
    const x = (LABEL_PADDING_PX + textWidth + gap) * LABEL_SCALE
    const badgeHeight = (BADGE_FONT_PX + 4) * LABEL_SCALE
    ctx.fillStyle = badge.color
    ctx.beginPath()
    ctx.roundRect(
      x,
      (canvas.height - badgeHeight) / 2,
      badgeWidth * LABEL_SCALE,
      badgeHeight,
      badgeHeight / 2,
    )
    ctx.fill()
    ctx.font = badgeFont
    ctx.fillStyle = '#0f1115'
    ctx.textAlign = 'center'
    ctx.fillText(
      badge.text,
      x + (badgeWidth * LABEL_SCALE) / 2,
      canvas.height / 2 + 1,
    )
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return { texture, width, height }
}
