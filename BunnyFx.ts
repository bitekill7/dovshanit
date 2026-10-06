
import Phaser from 'phaser'
import { MAX_TILT_DEG } from './constants'
import type { Bunny } from './Bunny'
import type { BoxManager, PhysicsBox } from './Boxes'
import type { Speaker } from './Speaker'

/* ============================================================
 *  אפקטים חזותיים של הדמות: מעיכה בנחיתה, הטיה, כוכבי סחרחורת ודיבור על נחיתה
 * ============================================================ */
export class BunnyFx {
  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly speaker: Speaker
  private readonly boxes: BoxManager
  private readonly stars: Phaser.GameObjects.Text[]

  private squashTween?: Phaser.Tweens.Tween
  private wasDizzy = false
  private lastPerch?: PhysicsBox

  constructor(scene: Phaser.Scene, bunny: Bunny, speaker: Speaker, boxes: BoxManager) {
    this.scene = scene
    this.bunny = bunny
    this.speaker = speaker
    this.boxes = boxes

    this.stars = Array.from({ length: 3 }, () =>
      scene.add
        .text(0, 0, '★', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffd54a', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(101)
        .setVisible(false)
    )
  }

  /** איפוס מצבי האפקטים (בעת הבאת הדמות למרכז). */
  reset(): void {
    this.wasDizzy = false
    this.lastPerch = undefined
  }

  cancelSquash(): void {
    this.squashTween = undefined
  }

  /** נחיתה על הקרקע/קופסה: מעיכה ודיבור, וזיהוי ירידה מקצה קופסה. */
  trackLanding(): void {
    const bunny = this.bunny
    const onGround = bunny.isGrounded()
    const perch = this.boxes.perchedOn()

    if (onGround && !bunny.wasOnGround) {
      if (bunny.leaping) bunny.endLeap()
      if (bunny.prevVy > 180) {
        this.squash()
        if (bunny.prevVy > 600) this.speaker.say('landing')
      }
    }

    // ירדה מקצה קופסה (נפילה, לא קפיצה כלפי מעלה)
    if (this.lastPerch && !perch && !onGround && !bunny.leaping && bunny.body.velocity.y > 0) {
      this.speaker.say('jumpDown')
    }

    this.lastPerch = perch
    bunny.wasOnGround = onGround
  }

  private squash(): void {
    const sprite = this.bunny.sprite
    this.squashTween?.stop()
    sprite.setScale(1)
    this.squashTween = this.scene.tweens.add({
      targets: sprite,
      scaleX: 1.25,
      scaleY: 0.75,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.setScale(1)
    })
  }

  /** @param dragVelocityX מהירות הגרירה (בזמן שהמשתמש אוחז בדמות) */
  updateTilt(delta: number, dragVelocityX: number): void {
    const bunny = this.bunny
    if (bunny.performing) return // באמצע סלטה: ה-tween שולט בזווית

    const now = this.scene.time.now
    const vx = bunny.dragging ? dragVelocityX * 0.6 : bunny.body.velocity.x
    let target = Phaser.Math.Clamp(vx * 0.05, -MAX_TILT_DEG, MAX_TILT_DEG)

    if (bunny.fearing) {
      target =
        Math.sin(now * 0.075) * 7 +
        Math.sin(now * 0.145) * 3
    } else if (bunny.sleeping) target = bunny.sprite.flipX ? -10 : 10
    else if (now < bunny.danceUntil) target += Math.sin(now * 0.02) * 20
    else if (now < bunny.dizzyUntil) target += Math.sin(now * 0.012) * 14
    else if (now < bunny.pettedUntil) target += Math.sin(now * 0.011) * 6
    else if (!bunny.dragging && bunny.isGrounded() && Math.abs(vx) > 20) target += Math.sin(now * 0.018) * 5

    const smoothing = 1 - Math.exp(-delta / 90)
    bunny.sprite.angle = Phaser.Math.Linear(bunny.sprite.angle, target, smoothing)
  }

  updateDizzy(): void {
    const now = this.scene.time.now
    const dizzy = now < this.bunny.dizzyUntil
    const sprite = this.bunny.sprite

    if (this.wasDizzy && !dizzy) this.speaker.say('dizzyOver')
    this.wasDizzy = dizzy

    this.stars.forEach((star, i) => {
      star.setVisible(dizzy)
      if (!dizzy) return
      const a = now * 0.008 + (i * Math.PI * 2) / this.stars.length
      star.setPosition(
        sprite.x + Math.cos(a) * sprite.displayWidth * 0.35,
        sprite.y - sprite.displayHeight - 6 + Math.sin(a) * 8
      )
    })
  }
}



