import Phaser from 'phaser'
import {
  CALM_GAIN_SPEED,
  CALM_HOLD_MS,
  CALM_LOSE_SPEED,
  PET_BLOCK_AFTER_GRAB_MS,
  PET_GRACE_MS,
  PET_MIN_REVERSALS,
  PET_REQUIRED_MS,
  PET_REVERSAL_PX,
  PET_STROKE_MAX_SPEED,
  PET_STROKE_MIN_SPEED,
  REPEL_RADIUS
} from './constants'
import type { Bunny } from './Bunny'
import type { CarrotManager } from './Carrots'
import type { Interaction } from './Moods'
import type { Navigator } from './Navigator'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'

const HEARTS = ['💗', '💖', '❤️', '💕']
const FACES = ['😊', '🥰', '😄', '☺️']

/** סופר היפוכי כיוון לאורך ציר אחד: ליטוף הוא תנועה הלוך-חזור, לא העברה ישרה של הסמן. */
export class ReversalCounter {
  count = 0
  private dir = 0
  private against = 0

  reset(): void {
    this.count = 0
    this.dir = 0
    this.against = 0
  }

  push(delta: number, thresholdPx: number): void {
    if (delta === 0) return
    const sign = Math.sign(delta)
    if (this.dir === 0) {
      this.dir = sign
      return
    }
    if (sign === this.dir) {
      this.against = 0
      return
    }
    // תנועה בכיוון ההפוך נצברת; רק מרחק של ממש נחשב להיפוך (רעידות קטנות של הסמן לא נספרות)
    this.against += Math.abs(delta)
    if (this.against >= thresholdPx) {
      this.count++
      this.dir = sign
      this.against = 0
    }
  }
}

export interface PettingDeps {
  scene: Phaser.Scene
  bunny: Bunny
  settings: SettingsStore
  speaker: Speaker
  interaction: Interaction
  carrots: CarrotManager
  nav: Navigator
}

/* ============================================================
 *  ליטוף: הסמן עובר מעליה לאט ובעדינות, הלוך-חזור, לפחות שנייה אחת.
 *  לא מופעל בטעות: לא בזמן אחיזה/לחיצה/זריקה, לא בגלל מעבר מהיר של הסמן,
 *  ולא בגלל תנועה ישרה אחת. בנוסף, סמן איטי וקרוב מרגיע אותה (היא לא בורחת ממנו).
 * ============================================================ */
export class Petting {
  /** היא נהנית מליטוף כרגע: עומדת במקום ומגיבה. */
  active = false
  /** הסמן איטי וקרוב כבר זמן מה: היא סומכת עליו ולא בורחת. */
  calm = false

  private readonly d: PettingDeps
  private readonly rx = new ReversalCounter()
  private readonly ry = new ReversalCounter()

  private speed = 0 // מהירות הסמן המוחלקת (px/s)
  private lastX = 0
  private lastY = 0
  private hasLast = false
  private progress = 0
  private lastStrokeAt = -Infinity
  private blockUntil = 0
  private slowSince = 0
  private startedAt = 0
  private lastEffectAt = 0
  private lastTalkAt = 0

  constructor(deps: PettingDeps) {
    this.d = deps
  }

  /** האם הדמות לא אמורה לברוח מהסמן כרגע (היא מלוטפת או סומכת עליו). */
  get suppressesFlee(): boolean {
    return this.active || this.calm
  }

  /** נקרא כל פריים, לפני ההתנהגות החופשית. */
  update(now: number, delta: number): void {
    const { scene, bunny, settings, interaction, carrots } = this.d
    const pointer = scene.input.activePointer

    // מהירות הסמן
    let dx = 0
    let dy = 0
    if (this.hasLast) {
      dx = pointer.x - this.lastX
      dy = pointer.y - this.lastY
    }
    this.lastX = pointer.x
    this.lastY = pointer.y
    this.hasLast = true
    const seconds = Math.max(delta, 1) / 1000
    this.speed = Phaser.Math.Linear(this.speed, Math.hypot(dx, dy) / seconds, 0.35)

    // אחיזה / לחיצה / זריקה: חוסמים ליטוף לזמן מה, כדי שהרמה של הדמות לא תיחשב ללטיפה
    if (bunny.dragging || pointer.isDown) this.blockUntil = now + PET_BLOCK_AFTER_GRAB_MS

    const unavailable =
      !settings.get().petEnabled ||
      !interaction.pointerSeen ||
      bunny.dragging ||
      bunny.fearing ||
      bunny.sleeping ||
      bunny.performing ||
      now < bunny.dizzyUntil
    if (unavailable) {
      this.stop(now, false)
      this.calm = false
      this.slowSince = 0
      return
    }

    const c = bunny.body.center
    this.updateCalm(now, Phaser.Math.Distance.Between(pointer.x, pointer.y, c.x, c.y))

    const sprite = bunny.sprite
    const over =
      pointer.x > sprite.x - sprite.displayWidth / 2 - 6 &&
      pointer.x < sprite.x + sprite.displayWidth / 2 + 6 &&
      pointer.y > sprite.y - sprite.displayHeight - 6 &&
      pointer.y < sprite.y + 4
    const canPet = carrots.items.length === 0 && bunny.isGrounded() && !bunny.leaping && now >= this.blockUntil

    if (over && canPet) {
      this.rx.push(dx, PET_REVERSAL_PX)
      this.ry.push(dy, PET_REVERSAL_PX)
    }

    const stroking = over && canPet && this.speed >= PET_STROKE_MIN_SPEED && this.speed <= PET_STROKE_MAX_SPEED
    if (stroking) {
      this.progress += delta
      this.lastStrokeAt = now
    } else if (now - this.lastStrokeAt > 600) {
      this.progress = Math.max(0, this.progress - delta * 2)
    }
    if (this.progress === 0 && !this.active) {
      this.rx.reset()
      this.ry.reset()
    }

    if (!this.active) {
      const reversals = this.rx.count + this.ry.count
      if (over && canPet && this.progress >= PET_REQUIRED_MS && reversals >= PET_MIN_REVERSALS) this.begin(now)
      return
    }

    if (!over || !canPet || now - this.lastStrokeAt > PET_GRACE_MS) {
      this.stop(now, true)
      return
    }
    this.sustain(now)
  }

  /* ---------------- רוגע: סמן איטי וקרוב = אין סיבה לברוח ---------------- */

  private updateCalm(now: number, dist: number): void {
    if (dist >= REPEL_RADIUS * 1.3) {
      this.calm = false
      this.slowSince = 0
      return
    }
    if (this.calm) {
      if (this.speed > CALM_LOSE_SPEED) {
        this.calm = false
        this.slowSince = 0
      }
      return
    }
    if (this.speed >= CALM_GAIN_SPEED) {
      this.slowSince = 0
    } else if (this.slowSince === 0) {
      this.slowSince = now
    } else if (now - this.slowSince >= CALM_HOLD_MS) {
      this.calm = true
    }
  }

  /* ---------------- מחזור הליטוף ---------------- */

  private begin(now: number): void {
    const { bunny, nav, speaker } = this.d
    this.active = true
    this.startedAt = now
    this.lastEffectAt = now
    this.lastTalkAt = now

    nav.clearGoal()
    nav.clearRoute()
    bunny.endLeap()
    bunny.body.setVelocityX(0)
    speaker.say('petStart', true)
    this.burst(4)
  }

  private sustain(now: number): void {
    const { bunny, interaction, speaker } = this.d
    bunny.pettedUntil = now + 400
    bunny.body.setVelocityX(0)
    interaction.mark()

    if (now - this.lastEffectAt >= 380) {
      this.lastEffectAt = now
      this.burst(1)
    }
    if (now - this.lastTalkAt >= 3200) {
      this.lastTalkAt = now
      // ליטוף מהיר יחסית מדגדג, ליטוף איטי נעים
      speaker.say(this.speed > 200 ? 'petTickle' : 'petPleasant')
    }
  }

  /** @param natural true = המשתמש הפסיק ללטף (ולא שמשהו קטע אותנו) */
  private stop(now: number, natural: boolean): void {
    const wasActive = this.active
    const duration = now - this.startedAt
    this.active = false
    this.progress = 0
    this.rx.reset()
    this.ry.reset()
    if (!wasActive) return

    this.blockUntil = Math.max(this.blockUntil, now + 800)
    if (natural && duration >= 3000) this.d.speaker.say('petEnd', true)
  }

  /* ---------------- לבבות וסמיילים ---------------- */

  private burst(count: number): void {
    const { scene, bunny } = this.d
    for (let i = 0; i < count; i++) {
      scene.time.delayedCall(i * 90, () => {
        const sprite = bunny.sprite
        const pool = Math.random() < 0.65 ? HEARTS : FACES
        const emoji = Phaser.Utils.Array.GetRandom(pool)
        const x = sprite.x + Phaser.Math.Between(-28, 28)
        const y = sprite.y - sprite.displayHeight - Phaser.Math.Between(0, 14)
        const icon = scene.add
          .text(x, y, emoji, { fontFamily: 'sans-serif', fontSize: `${Phaser.Math.Between(18, 26)}px` })
          .setOrigin(0.5)
          .setDepth(102)
        scene.tweens.add({
          targets: icon,
          x: x + Phaser.Math.Between(-18, 18),
          y: y - Phaser.Math.Between(50, 90),
          alpha: 0,
          scale: 1.4,
          duration: Phaser.Math.Between(1100, 1600),
          ease: 'Sine.easeOut',
          onComplete: () => icon.destroy()
        })
      })
    }
  }
}
