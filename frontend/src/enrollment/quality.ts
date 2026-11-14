import type { FrameAssessment } from './types'
export interface Point { x: number; y: number; z?: number }
export interface Bounds { x: number; y: number; width: number; height: number }

export function faceBounds(points: readonly Point[]): Bounds | null {
  if (points.length < 468 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  const xs = points.map(point => point.x), ys = points.map(point => point.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function eyeAspectRatio(points: readonly Point[], indices: readonly number[], width: number, height: number): number {
  const distance = (a: number, b: number) => Math.hypot((points[a].x - points[b].x) * width, (points[a].y - points[b].y) * height)
  return (distance(indices[1], indices[5]) + distance(indices[2], indices[4])) / Math.max(1e-5, 2 * distance(indices[0], indices[3]))
}

/** Face crop normalized to a fixed resolution; independent of webcam megapixels. */
export function pixelQuality(rgba: Uint8ClampedArray, width: number, height: number) {
  const gray = new Float32Array(width * height)
  let sum = 0
  for (let i = 0; i < gray.length; i++) {
    gray[i] = rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114
    sum += gray[i]
  }
  let laplacian = 0, squared = 0, count = 0
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    const value = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]
    laplacian += value; squared += value * value; count++
  }
  return { brightness: sum / Math.max(1, gray.length), sharpness: Math.max(0, squared / Math.max(1, count) - (laplacian / Math.max(1, count)) ** 2) }
}

export function qualityIssue(box: Bounds, brightness: number, sharpness: number, eyes: number): FrameAssessment['issue'] {
  if (box.width < .23 || box.height < .28) return 'too-small'
  if (box.width > .78 || box.height > .88) return 'too-close'
  if (box.x < .015 || box.y < .015 || box.x + box.width > .985 || box.y + box.height > .985) return 'cropped'
  if (brightness < 45) return 'dark'
  if (brightness > 220) return 'bright'
  if (sharpness < 35) return 'blurry'
  if (eyes < .13) return 'eyes-closed'
  return null
}
