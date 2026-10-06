import Phaser from 'phaser'
import { ATTENTION_NOTICE_MS, WAKE_RADIUS } from './constants'
import type { Bunny } from './Bunny'
import type { CarrotManager } from './Carrots'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'

/* ============================================================
 *  מעקב אחרי מגע המשתמש: שעמום, תשומת לב וקיום עכבר בחלון
 * ============================================================ */
export class Interaction {
  lastInteraction = 0
  lastAttention = 0
  attentionAt = 0
  pointerSeen = false

  private readonly scene: Phaser.Scene
  private readonly speaker: Speaker

  constructor(scene: Phaser.Scene, speaker: Speaker) {
    this.scene = scene
    this.speaker = speaker
  }

  /** כל מגע אמיתי של המשתמש: מאפס שעמום, ומגיב אם היא קראה לתשומת לב ("סוף סוף שמת לב"). */
  mark(): void {
    const now = this.scene.time.now
    this.lastInteraction = now
    if (this.attentionAt > 0) {
      if (now - this.attentionAt < ATTENTION_NOTICE_MS) this.speaker.say('noticed', true)
      this.attentionAt = 0
    }
  }
}

/** grabbed / threat: התעוררות שקטה (בלי משפט וקפיצה), כי משהו אחר כבר מדבר בשמה. */
export type WakeReason = 'timeout' | 'disturbed' | 'grabbed' | 'smell' | 'threat'

/* ============================================================
 *  שינה: נרדמת כשמתעלמים ממנה, מתעוררת מעכבר קרוב / ריח גזר / לחיצה
 * ============================================================ */
export class Sleep {
  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly speaker: Speaker
  private readonly carrots: CarrotManager
  private readonly interaction: Interaction
  private sleepUntil = 0

  constructor(scene: Phaser.Scene, bunny: Bunny, speaker: Speaker, carrots: CarrotManager, interaction: Interaction) {
    this.scene = scene
    this.bunny = bunny
    this.speaker = speaker
    this.carrots = carrots
    this.interaction = interaction

    scene.time.addEvent({ delay: 1100, loop: true, callback: () => this.bunny.sleeping && this.spawnZ() })
  }

  fallAsleep(): void {
    this.bunny.sleeping = true
    this.sleepUntil = this.scene.time.now + Phaser.Math.Between(15000, 30000)
    this.bunny.body.setVelocityX(0)
    this.speaker.say('sleepy', true)
  }

  wake(reason: WakeReason): void {
    if (!this.bunny.sleeping) return
    this.bunny.sleeping = false
    this.bunny.sprite.setScale(1)
    this.interaction.lastInteraction = this.scene.time.now

    if (reason === 'grabbed' || reason === 'threat') return
    if (reason === 'smell') {
      this.speaker.say('wakeCarrot', true)
      this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.62, 300))
    } else if (reason === 'disturbed') {
      this.speaker.say('wakeStartled', true)
      this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.62, 300))
    } else {
      this.speaker.say('wakeRested', true)
    }
  }

  update(now: number, pointerDist: number): void {
    this.bunny.body.velocity.x = 0
    if (now >= this.sleepUntil) {
      this.wake('timeout')
      return
    }
    const c = this.bunny.body.center
    if (this.carrots.items.some(k => Phaser.Math.Distance.Between(k.sprite.x, k.sprite.y, c.x, c.y) < 300)) {
      this.wake('smell')
      return
    }
    if (pointerDist < WAKE_RADIUS) {
      this.wake('disturbed')
      return
    }
    this.bunny.sprite.setScale(1, 1 + Math.sin(now * 0.003) * 0.03)
  }

  private spawnZ(): void {
    const sprite = this.bunny.sprite
    const z = this.scene.add
      .text(sprite.x + 16, sprite.y - sprite.displayHeight, 'Z', {
        fontFamily: 'sans-serif',
        fontSize: `${Phaser.Math.Between(14, 22)}px`,
        color: '#bde0ff',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setDepth(100)

    this.scene.tweens.add({
      targets: z,
      x: z.x + 20,
      y: z.y - 50,
      alpha: 0,
      duration: 1800,
      onComplete: () => z.destroy()
    })
  }
}

/* ============================================================
 *  "תסתכל עליי!": מושכת תשומת לב כשמתעלמים ממנה (טבעות, סלטה, ריקוד)
 * ============================================================ */
export class Attention {
  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly settings: SettingsStore
  private readonly speaker: Speaker
  private readonly interaction: Interaction

  constructor(scene: Phaser.Scene, bunny: Bunny, settings: SettingsStore, speaker: Speaker, interaction: Interaction) {
    this.scene = scene
    this.bunny = bunny
    this.settings = settings
    this.speaker = speaker
    this.interaction = interaction
  }

  perform(now: number): void {
    if (!this.settings.get().attentionEnabled) return
    this.interaction.lastAttention = now
    this.interaction.attentionAt = now

    switch (Phaser.Math.Between(0, 2)) {
      case 0:
        this.emitRipple()
        this.speaker.say('attention', true)
        this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.62, 300))
        break
      case 1:
        this.doFlip()
        break
      default:
        this.doDance(now)
        break
    }
  }

  // טבעות סונאר מתרחבות מסביב לדמות
  private emitRipple(): void {
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 250, () => {
        const sprite = this.bunny.sprite
        const ring = this.scene.add
          .circle(sprite.x, sprite.y - sprite.displayHeight / 2, 10)
          .setStrokeStyle(4, 0xffd54a)
          .setDepth(99)
        this.scene.tweens.add({
          targets: ring,
          scale: 9,
          alpha: 0,
          duration: 1100,
          ease: 'Quad.easeOut',
          onComplete: () => ring.destroy()
        })
      })
    }
  }

  // סלטה באוויר
  private doFlip(): void {
    const sprite = this.bunny.sprite
    this.bunny.performing = true
    this.speaker.say('attentionFlip', true)
    this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.85, 420))
    this.scene.tweens.add({
      targets: sprite,
      angle: sprite.flipX ? -360 : 360,
      duration: 700,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        sprite.setAngle(0)
        this.bunny.performing = false
      }
    })
  }

  // ריקוד: קפיצות קצובות והתנדנדות
  private doDance(now: number): void {
    this.bunny.danceUntil = now + 1800
    this.speaker.say('attentionDance', true)
    this.scene.time.addEvent({
      delay: 380,
      repeat: 3,
      callback: () => {
        const s = this.settings.get()
        if (s.attentionEnabled && s.randomEventsEnabled && this.bunny.isGrounded() && !this.bunny.dragging) {
          this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.62, 300))
        }
      }
    })
  }
}
