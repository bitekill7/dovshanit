import Phaser from 'phaser'
import { DIZZY_MS, DRAG_SMOOTH_MS, GRAB_CONFIRM_MS, GRAB_CONFIRM_PX, MAX_THROW_SPEED, THROW_SPEECH_SPEED } from './constants'
import type { Bunny, Stage } from './Bunny'
import type { BoxManager } from './Boxes'
import type { BunnyFx } from './BunnyFx'
import type { ContextMenu } from './UI'
import type { Interaction, Sleep } from './Moods'
import type { Navigator } from './Navigator'
import type { Speaker } from './Speaker'

/* זיהוי ניעור */
interface Sample {
  x: number
  y: number
  t: number
}

export class ShakeDetector {
  private samples: Sample[] = []
  private readonly windowMs: number
  private readonly minPath: number
  private readonly maxNetRatio: number

  constructor(windowMs = 700, minPath = 650, maxNetRatio = 0.35) {
    this.windowMs = windowMs
    this.minPath = minPath
    this.maxNetRatio = maxNetRatio
  }

  reset(): void {
    this.samples.length = 0
  }

  push(x: number, y: number, t: number): boolean {
    const last = this.samples[this.samples.length - 1]
    if (last && Math.hypot(x - last.x, y - last.y) < 2) return false

    this.samples.push({ x, y, t })
    while (this.samples.length > 0 && t - this.samples[0].t > this.windowMs) this.samples.shift()
    if (this.samples.length < 6) return false

    let path = 0
    for (let i = 1; i < this.samples.length; i++) {
      path += Math.hypot(this.samples[i].x - this.samples[i - 1].x, this.samples[i].y - this.samples[i - 1].y)
    }
    const first = this.samples[0]
    const net = Math.hypot(x - first.x, y - first.y)

    if (path >= this.minPath && net <= path * this.maxNetRatio) {
      this.reset()
      return true
    }
    return false
  }
}

/* ============================================================
 *  גרירה, זריקה, ניעור ו"דקירה" של הדמות
 * ============================================================ */
export class DragController {
  readonly throwVelocity = new Phaser.Math.Vector2()

  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly stage: Stage
  private readonly speaker: Speaker
  private readonly interaction: Interaction
  private readonly menu: ContextMenu
  private readonly boxes: BoxManager
  private readonly sleep: Sleep
  private readonly nav: Navigator
  private readonly fx: BunnyFx

  private grabConfirmed = false
  private downTime = 0
  private readonly downPoint = new Phaser.Math.Vector2()
  private readonly grabOffset = new Phaser.Math.Vector2()
  private readonly shake = new ShakeDetector()
  private pokeTimes: number[] = []

  constructor(
    scene: Phaser.Scene,
    bunny: Bunny,
    stage: Stage,
    speaker: Speaker,
    interaction: Interaction,
    menu: ContextMenu,
    boxes: BoxManager,
    sleep: Sleep,
    nav: Navigator,
    fx: BunnyFx
  ) {
    this.scene = scene
    this.bunny = bunny
    this.stage = stage
    this.speaker = speaker
    this.interaction = interaction
    this.menu = menu
    this.boxes = boxes
    this.sleep = sleep
    this.nav = nav
    this.fx = fx
  }

  start(pointer: Phaser.Input.Pointer): void {
    const bunny = this.bunny
    this.menu.hide()
    if (bunny.sleeping) this.sleep.wake('grabbed')
    bunny.endLeap()
    this.nav.clearGoal()
    bunny.performing = false
    bunny.danceUntil = 0

    bunny.dragging = true
    this.grabConfirmed = false
    this.downTime = this.scene.time.now
    this.interaction.mark()
    this.downPoint.set(pointer.x, pointer.y)
    this.grabOffset.set(pointer.x - bunny.sprite.x, pointer.y - bunny.sprite.y)
    this.throwVelocity.set(0, 0)
    this.shake.reset()
    bunny.wasOnGround = false

    this.scene.tweens.killTweensOf(bunny.sprite)
    this.fx.cancelSquash()
    bunny.sprite.setScale(1.1)
    bunny.body.setAllowGravity(false)
    bunny.body.setVelocity(0, 0)
    bunny.body.checkCollision.none = true
    this.scene.input.setDefaultCursor('grabbing')
  }

  update(delta: number): void {
    const bunny = this.bunny
    const pointer = this.scene.input.activePointer
    const now = this.scene.time.now
    const sprite = bunny.sprite

    const halfW = sprite.displayWidth / 2
    const targetX = Phaser.Math.Clamp(pointer.x - this.grabOffset.x, halfW, this.stage.width - halfW)
    const targetY = Phaser.Math.Clamp(pointer.y - this.grabOffset.y, sprite.displayHeight, this.stage.floorY)
    const follow = 1 - Math.exp(-delta / DRAG_SMOOTH_MS)

    const prevX = sprite.x
    const prevY = sprite.y
    const nx = Phaser.Math.Linear(prevX, targetX, follow)
    const ny = Phaser.Math.Linear(prevY, targetY, follow)
    bunny.body.reset(nx, ny)

    const seconds = Math.max(delta, 1) / 1000
    this.throwVelocity.x = Phaser.Math.Linear(this.throwVelocity.x, (nx - prevX) / seconds, 0.3)
    this.throwVelocity.y = Phaser.Math.Linear(this.throwVelocity.y, (ny - prevY) / seconds, 0.3)

    if (!this.grabConfirmed) {
      const moved = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.downPoint.x, this.downPoint.y)
      if (moved > GRAB_CONFIRM_PX || now - this.downTime > GRAB_CONFIRM_MS) {
        this.grabConfirmed = true
        this.speaker.say('grab', true)
      }
    }

    if (this.grabConfirmed && this.shake.push(pointer.x, pointer.y, now)) {
      bunny.dizzyUntil = now + DIZZY_MS
      this.speaker.say('shake')
    }
  }

  end(): void {
    const bunny = this.bunny
    if (!bunny.dragging) return
    bunny.dragging = false
    this.scene.input.setDefaultCursor('')
    bunny.sprite.setScale(1)
    bunny.body.setAllowGravity(true)
    bunny.body.checkCollision.none = false
    this.shake.reset()
    this.boxes.list.forEach(b => this.boxes.rescueFromBox(b))

    if (!this.grabConfirmed) {
      const now = this.scene.time.now
      this.pokeTimes = this.pokeTimes.filter(t => now - t < 5000)
      this.pokeTimes.push(now)
      this.speaker.say(this.pokeTimes.length >= 3 ? 'annoyed' : 'poke', true)
      bunny.body.setVelocityY(bunny.jumpVelocity(0.22, 320))
      return
    }

    const vx = Phaser.Math.Clamp(this.throwVelocity.x, -MAX_THROW_SPEED, MAX_THROW_SPEED)
    const vy = Phaser.Math.Clamp(this.throwVelocity.y, -MAX_THROW_SPEED, MAX_THROW_SPEED)
    bunny.body.setVelocity(vx, vy)
    if (Math.hypot(vx, vy) > THROW_SPEECH_SPEED) this.speaker.say('thrown', true)
  }
}
