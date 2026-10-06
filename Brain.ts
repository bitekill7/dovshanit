import Phaser from 'phaser'
import {
  ATTENTION_COOLDOWN_MS,
  ATTENTION_IDLE_MS,
  BOX_CLIMB_CHANCE,
  INTERACTION_RADIUS,
  MAX_FLEE_SPEED,
  NAP_IDLE_MS,
  REPEL_ACCEL,
  REPEL_RADIUS
} from './constants'
import type { Bunny, Stage } from './Bunny'
import type { Ball } from './Ball'
import type { BoxManager } from './Boxes'
import type { CarrotManager } from './Carrots'
import type { Feelings } from './Feelings'
import type { Attention, Interaction, Sleep } from './Moods'
import type { Navigator } from './Navigator'
import type { Petting } from './Petting'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'

export interface BrainDeps {
  scene: Phaser.Scene
  bunny: Bunny
  stage: Stage
  settings: SettingsStore
  speaker: Speaker
  interaction: Interaction
  boxes: BoxManager
  carrots: CarrotManager
  nav: Navigator
  sleep: Sleep
  attention: Attention
  ball: Ball
  pet: Petting
  feelings: Feelings
}

/* ============================================================
 *  המוח: החלטות אקראיות ("מחשבות") והתנהגות חופשית בכל פריים
 *  (בריחה מהעכבר, שינה, קפיצונים, התרסקות בקיר)
 * ============================================================ */
export class Brain {
  private readonly d: BrainDeps
  private wasBlockedSide = false

  constructor(deps: BrainDeps) {
    this.d = deps
    this.scheduleThought()
  }

  /** כל פריים שבו המשתמש לא גורר את הדמות. */
  updateFree(now: number, dt: number): void {
    const { scene, bunny, stage, settings, speaker, interaction, carrots, nav, sleep, ball, pet, feelings } = this.d
    const repelRadius = REPEL_RADIUS * feelings.fleeScale()
    const body = bunny.body
    const pointer = scene.input.activePointer
    const c = body.center
    const pointerDist = interaction.pointerSeen ? Phaser.Math.Distance.Between(pointer.x, pointer.y, c.x, c.y) : Infinity

    if (pointerDist < INTERACTION_RADIUS) interaction.mark()

    if (bunny.sleeping) {
      sleep.update(now, pointerDist)
      return
    }

    bunny.expireLeap(now)

    carrots.checkEat()

    // מלטפים אותה: עומדת במקום ונהנית (בלי ניווט, בריחה או קפיצונים)
    if (pet.active) {
      body.setVelocityX(0)
      this.wasBlockedSide = false
      return
    }

    nav.steer(now)
    ball.steer(now)

    // בורחת מהעכבר, אלא אם המשתמש מחזיק גזר (אז היא באה אליו)
    if (settings.get().fleeMouseEnabled && !bunny.leaping && !carrots.held && !pet.suppressesFlee && pointerDist < repelRadius) {
      const force = (repelRadius - pointerDist) / repelRadius
      const direction = c.x < pointer.x ? -1 : 1
      const panic = now < bunny.dizzyUntil ? 0.4 : 1

      const next = body.velocity.x + direction * force * REPEL_ACCEL * dt * panic
      body.velocity.x = Phaser.Math.Clamp(next, -MAX_FLEE_SPEED, MAX_FLEE_SPEED)

      if (Math.abs(body.velocity.x) > 100) speaker.say('taunt')

      const edge = 90
      const nearEdge = (direction === -1 && c.x < edge) || (direction === 1 && c.x > stage.width - edge)
      if (nearEdge && pointerDist < 90) speaker.say('cornered')
      if (nearEdge && bunny.isGrounded() && pointerDist < 60) body.setVelocityY(bunny.jumpVelocity(0.55, 430))
    }

    if (Math.abs(body.velocity.x) > 10) bunny.sprite.flipX = body.velocity.x < 0

    // התרסקות בקיר במהירות גבוהה (בד"כ אחרי זריקה)
    const sideBlocked = body.blocked.left || body.blocked.right
    if (sideBlocked && !this.wasBlockedSide && Math.abs(bunny.prevVx) > 450) speaker.say('wallHit')
    this.wasBlockedSide = sideBlocked
  }

  /* ---------------- מחשבות אקראיות ---------------- */

  private scheduleThought(): void {
    this.d.scene.time.delayedCall(Phaser.Math.Between(2500, 4500), () => {
      this.think()
      this.scheduleThought()
    })
  }

  private think(): void {
    const { scene, bunny, settings, speaker, interaction, boxes, carrots, nav, sleep, attention, ball, pet, feelings } = this.d
    if (pet.active || bunny.dragging || bunny.fearing || bunny.sleeping || carrots.items.length > 0 || nav.goal || !bunny.isGrounded()) return
    if (ball.playing(scene.time.now)) return // באמצע משחק: לא מפריעים לה במחשבות אקראיות
    const now = scene.time.now
    const body = bunny.body
    const idle = now - interaction.lastInteraction
    const s = settings.get()

    // אירועים אקראיים (שינה / תשומת לב / משפט) כפופים למתג ולסיכוי הגלובלי.
    // שיטוט וטיפוס על קופסאות לא תלויים בהם: הדמות לא קופאת כשהאירועים כבויים.
    if (idle > NAP_IDLE_MS && Math.random() < 0.3 && settings.rollRandomEvent()) {
      sleep.fallAsleep()
      return
    }

    // מושכת תשומת לב אם מתעלמים ממנה
    if (
      s.attentionEnabled &&
      idle > ATTENTION_IDLE_MS &&
      now - interaction.lastAttention > ATTENTION_COOLDOWN_MS &&
      Math.random() < 0.5 &&
      settings.rollRandomEvent()
    ) {
      attention.perform(now)
      return
    }

    if (Math.random() < 0.25 && settings.rollRandomEvent()) speaker.say('random')

    // עומדת בגאווה על קופסה
    const perched = boxes.perchedOn()
    if (perched && now < nav.perchUntil) {
      body.setVelocityX(0)
      if (Math.random() < 0.3) body.setVelocityY(bunny.jumpVelocity(0.28, 360))
      return
    }

    // רצון חזק לטפס על קופסה
    if (boxes.list.length > 0 && Math.random() < BOX_CLIMB_CHANCE) {
      const target = boxes.pickTarget(perched)
      if (target) {
        nav.setGoal(target, now)
        return
      }
    }

    // שיטוט רגיל בקפיצונים
    const roll = Math.random()
    if (roll < 0.8) {
      const dir = roll < 0.4 ? 1 : -1
      const walk = s.walkSpeed * feelings.walkScale()
      body.setVelocityX(dir * Phaser.Math.Between(walk * 0.7, walk))
      body.setVelocityY(bunny.jumpVelocity(0.16, 300))
    } else {
      body.setVelocityX(0)
    }
    if (Math.random() < 0.25) body.setVelocityY(bunny.jumpVelocity(0.38, 380))
  }
}