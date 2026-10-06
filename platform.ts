import Phaser from 'phaser'
import { TASKBAR_FALLBACK_OFFSET, TASKBAR_FEET_SINK } from './constants'

/* ============================================================
 *  גבול הסביבה: כל מגע עם Electron (`window.electron`) ועם המסך/סרגל המשימות עובר כאן
 * ============================================================ */

/**
 * הגבול היחיד בין ה-renderer ל-preload.
 * כל גישה ל-`window.electron` עוברת כאן, כך שאף מודול אחר לא תלוי ב-Electron ישירות.
 */
export function closeApp(): void {
  window.electron.closeApp()
}

/** true = העכבר "עובר דרך" החלון השקוף (click-through). */
export function setIgnoreMouseEvents(ignore: boolean): void {
  window.electron.setIgnoreMouseEvents(ignore)
}

/** רצפה: מזהה את סרגל המשימות התחתון ומעמיד את הדמות עליו. */
export function computeFloorY(): number {
  const winH = window.innerHeight
  const info = window.screen as Screen & { availTop?: number }
  const availTop = info.availTop ?? 0
  const bottomTaskbarHeight = info.height - info.availHeight - availTop

  if (bottomTaskbarHeight > 0) {
    const taskbarTop = availTop + info.availHeight - window.screenY
    return Phaser.Math.Clamp(taskbarTop + TASKBAR_FEET_SINK, 100, winH)
  }
  return winH - TASKBAR_FALLBACK_OFFSET
}
