import Phaser from 'phaser'
import {
  BUNNY_TEXTURE_KEY,
  DRAG_X,
  GRAVITY_Y,
  LEAP_APEX_MARGIN,
  LEAP_TIMEOUT_MS,
  MAX_JUMP_HEIGHT,
  MIN_JUMP_HEIGHT
} from './constants'
import type { SettingsStore } from './SettingsStore'


export interface Stage {
  width: number
  floorY: number
}

/**
 * מצב ראשי מחושב (קדימות מגדירה מי שולט כשכמה דגלים דלוקים).
 * dragging > fear > sleeping > performing > leaping > dizzy > petted > free
 */
export type BunnyState = 'dragging' | 'fear' | 'sleeping' | 'performing' | 'leaping' | 'dizzy' | 'petted' | 'free'

/* ============================================================
 *  הדמות: ספרייט + גוף פיזיקלי + מצבי הדמות המשותפים לכל ההתנהגויות
 *  (ישנה / נגררת / סחרחורת / קפיצה מכוונת / הופעה) ויכולות הקפיצה שלה.
 *  המחלקה לא מכירה קופסאות, גזרים או דיבור.
 * ============================================================ */

export interface JumpGeometry {
  vy: number
  time: number
}

export class Bunny {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly body: Phaser.Physics.Arcade.Body

  // מצבים משותפים (נכתבים ע"י ההתנהגות האחראית, נקראים ע"י כולם)
  sleeping = false
  dragging = false
  fearing = false // מרחפת מעל "סגור דובשנית": קפואה ורועדת
  dizzyUntil = 0
  leaping = false
  leapStartedAt = 0
  performing = false // באמצע סלטה: ה-tween שולט בזווית
  danceUntil = 0
  pettedUntil = 0 // מלטפים אותה: רועדת קלות מרוב נעימות

  // זיכרון בין פריימים
  wasOnGround = false
  prevVx = 0
  prevVy = 0

  private readonly settings: SettingsStore
  private readonly stage: Stage

  constructor(scene: Phaser.Scene, settings: SettingsStore, stage: Stage) {
    this.settings = settings
    this.stage = stage

    this.sprite = scene.physics.add.sprite(stage.width / 2, 0, BUNNY_TEXTURE_KEY)
    this.sprite.setOrigin(0.5, 1).setDepth(20)
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body
    this.sprite.setCollideWorldBounds(true)
    this.sprite.setBounce(0.4, 0.15)
    this.body.setDragX(DRAG_X)

    const w = this.sprite.width
    const h = this.sprite.height
    this.sprite.setInteractive({
      hitArea: new Phaser.Geom.Circle(w / 2, h / 2, (Math.max(w, h) / 2) * 1.1),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      cursor: 'grab'
    })
  }

  /* ---------------- שאילתות ---------------- */

  /** המצב הראשי הנוכחי, נגזר מהדגלים לפי סדר קדימויות קבוע. */
  get state(): BunnyState {
    if (this.dragging) return 'dragging'
    if (this.fearing) return 'fear'
    if (this.sleeping) return 'sleeping'
    if (this.performing) return 'performing'
    if (this.leaping) return 'leaping'
    const now = this.sprite.scene.time.now
    if (now < this.dizzyUntil) return 'dizzy'
    if (now < this.pettedUntil) return 'petted'
    return 'free'
  }

  isGrounded(): boolean {
    return this.body.blocked.down || this.body.touching.down
  }

  clampX(x: number): number {
    const half = this.body.halfWidth
    return Phaser.Math.Clamp(x, half, this.stage.width - half)
  }

  /* ---------------- יכולות קפיצה ---------------- */

  maxJumpHeight(): number {
    return Phaser.Math.Clamp(this.settings.get().jumpHeight, MIN_JUMP_HEIGHT, MAX_JUMP_HEIGHT)
  }

  maxClimbRise(): number {
    return Math.max(1, this.maxJumpHeight() - LEAP_APEX_MARGIN)
  }

  jumpVelocity(multiplier = 1, cap = 520): number {
    const safeMultiplier = Phaser.Math.Clamp(multiplier, 0.05, 1)
    return -Math.min(cap, Math.sqrt(2 * GRAVITY_Y * this.maxJumpHeight() * safeMultiplier))
  }

  /** גיאומטריה של קפיצה בליסטית לגובה `rise` מעל המשטח הנוכחי; null אם בלתי אפשרי. */
  jumpGeometry(rise: number): JumpGeometry | null {
    const g = GRAVITY_Y
    const maxHeight = this.maxJumpHeight()
    if (rise > maxHeight - LEAP_APEX_MARGIN) return null

    const apex = Math.min(maxHeight, Math.max(70, rise + LEAP_APEX_MARGIN))
    const vy = -Math.sqrt(2 * g * apex)
    const discriminant = vy * vy - 2 * g * rise
    if (discriminant < 0) return null

    const time = (-vy + Math.sqrt(discriminant)) / g
    return Number.isFinite(time) && time > 0 ? { vy, time } : null
  }

  /* ---------------- קפיצה מכוונת ---------------- */

  beginLeap(now: number): void {
    this.leaping = true
    this.leapStartedAt = now
    this.body.setDragX(0)
  }

  endLeap(): void {
    this.leaping = false
    this.body.setDragX(DRAG_X)
  }

  /** קפיצה שלא נחתה בזמן סביר מבוטלת, כדי שהחיכוך יחזור. */
  expireLeap(now: number): void {
    if (this.leaping && now - this.leapStartedAt > LEAP_TIMEOUT_MS) this.endLeap()
  }

  /* ---------------- מחזור פריים / עולם ---------------- */

  rememberVelocity(): void {
    this.prevVy = this.body.velocity.y
    this.prevVx = this.body.velocity.x
  }

  /** מחזיר את הדמות פנימה אם גבולות העולם השתנו (שינוי גודל חלון / רצפה). */
  keepInside(): void {
    const halfW = this.body.halfWidth
    const clampedX = Phaser.Math.Clamp(this.body.center.x, halfW, this.stage.width - halfW)
    const clampedY = Phaser.Math.Clamp(this.sprite.y, this.sprite.displayHeight, this.stage.floorY)
    if (Math.abs(clampedX - this.body.center.x) > 0.1 || Math.abs(clampedY - this.sprite.y) > 0.1) {
      this.body.reset(clampedX, clampedY)
    }
  }

  /** איפוס מצבי הדמות והצבתה בנקודת ההתחלה (אמצע המסך, נופלת מלמעלה). */
  resetPose(): void {
    this.endLeap()
    this.sleeping = false
    this.fearing = false
    this.performing = false
    this.danceUntil = 0
    this.pettedUntil = 0
    this.dizzyUntil = 0
    this.wasOnGround = false
    this.sprite.setScale(1)
    this.sprite.setAngle(0)
    this.body.setAllowGravity(true)
    this.body.reset(this.stage.width / 2, this.sprite.displayHeight + 20)
  }
}
