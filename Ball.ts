import Phaser from 'phaser'
import {
  BALL_INTEREST_MS,
  BALL_KICK_COOLDOWN_MS,
  BALL_RADIUS,
  BALL_TEXTURE_KEY,
  MAX_BALL_THROW,
  OFFER_RADIUS
} from './constants'
import type { BoxManager, PhysicsBox } from './Boxes'
import type { Bunny, Stage } from './Bunny'
import type { CarrotManager } from './Carrots'
import type { Interaction, Sleep } from './Moods'
import type { Navigator } from './Navigator'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'
import type { ContextMenu } from './UI'

export interface BallDeps {
  scene: Phaser.Scene
  bunny: Bunny
  stage: Stage
  settings: SettingsStore
  speaker: Speaker
  boxes: BoxManager
  carrots: CarrotManager
  interaction: Interaction
  menu: ContextMenu
  nav: Navigator
  sleep: Sleep
}

/* ============================================================
 *  כדור: צעצוע שהמשתמש מוסיף, גורר וזורק. הדמות רצה אחריו, בועטת, מנגחת,
 *  מטפסת על קופסאות כדי להגיע אליו, ומשתעממת אם מפסיקים לשחק איתה.
 * ============================================================ */
export class Ball {
  /** המשתמש מחזיק את הכדור כרגע. */
  held = false

  private sprite?: Phaser.Physics.Arcade.Sprite
  private collider?: Phaser.Physics.Arcade.Collider

  private readonly d: BallDeps
  private readonly grab = new Phaser.Math.Vector2()
  private readonly throwVelocity = new Phaser.Math.Vector2()
  private interestUntil = 0
  private boredSaid = false
  private offerSaid = false
  private lastKick = 0
  private headerCooldownUntil = 0

  constructor(deps: BallDeps) {
    this.d = deps
    this.createTexture()
  }

  get exists(): boolean {
    return this.sprite !== undefined
  }

  /** האם היא עדיין "בעניין" של הכדור (משחקת איתו ורודפת אחריו). */
  playing(now: number): boolean {
    return this.sprite !== undefined && (this.held || now < this.interestUntil)
  }

  /* ---------------- יצירה / מחיקה ---------------- */

  private createTexture(): void {
    const { scene } = this.d
    if (scene.textures.exists(BALL_TEXTURE_KEY)) return
    const r = BALL_RADIUS
    const g = scene.make.graphics({ x: 0, y: 0 }, false)
    g.fillStyle(0xe53935, 1)
    g.fillCircle(r, r, r - 1)
    g.fillStyle(0xffffff, 1) // נקודות לבנות: רק בשבילן רואים שהכדור מתגלגל
    g.fillCircle(r + 7, r - 5, 4)
    g.fillCircle(r - 8, r + 6, 3)
    g.lineStyle(2, 0x7f1d1d, 1)
    g.strokeCircle(r, r, r - 1)
    g.generateTexture(BALL_TEXTURE_KEY, r * 2, r * 2)
    g.destroy()
  }

  toggle(): void {
    if (this.sprite) this.remove()
    else this.add()
  }

  add(): void {
    if (this.sprite) return
    const { scene, bunny, stage, boxes, speaker, interaction } = this.d
    const r = BALL_RADIUS
    const side = bunny.sprite.x > stage.width / 2 ? -1 : 1
    const x = Phaser.Math.Clamp(bunny.sprite.x + side * Phaser.Math.Between(160, 300), r + 4, stage.width - r - 4)

    const sprite = scene.physics.add.sprite(x, 20, BALL_TEXTURE_KEY)
    sprite.setDepth(16).setCollideWorldBounds(true).setBounce(0.78).setDragX(35)
    ;(sprite.body as Phaser.Physics.Arcade.Body).setCircle(r)
    sprite.setInteractive({
      hitArea: new Phaser.Geom.Circle(r, r, r + 6),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      cursor: 'grab'
    })
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.d.menu.show(pointer.x, pointer.y, [{ label: 'הסר כדור 🗑️', danger: true, onSelect: () => this.remove() }])
      } else if (pointer.leftButtonDown()) {
        this.startDrag(pointer)
      }
    })

    this.sprite = sprite
    this.collider = scene.physics.add.collider(sprite, boxes.group)
    this.refreshInterest()
    interaction.mark()
    speaker.say('ballAdded', true)
  }

  remove(): void {
    const sprite = this.sprite
    if (!sprite) return
    if (this.held) {
      this.held = false
      this.d.scene.input.setDefaultCursor('')
    }
    this.collider?.destroy()
    this.collider = undefined
    sprite.disableInteractive()
    sprite.destroy()
    this.sprite = undefined
    this.d.speaker.say('ballRemoved', true)
  }

  private refreshInterest(): void {
    this.interestUntil = this.d.scene.time.now + BALL_INTEREST_MS
    this.boredSaid = false
  }

  /* ---------------- גרירה וזריקה על ידי המשתמש ---------------- */

  startDrag(pointer: Phaser.Input.Pointer): void {
    const sprite = this.sprite
    const { bunny, carrots, menu, scene, interaction } = this.d
    if (!sprite || this.held || bunny.dragging || carrots.held) return

    menu.hide()
    this.held = true
    this.offerSaid = false
    this.grab.set(pointer.x - sprite.x, pointer.y - sprite.y)
    this.throwVelocity.set(0, 0)

    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setVelocity(0, 0)
    body.checkCollision.none = true
    scene.input.setDefaultCursor('grabbing')
    this.refreshInterest()
    interaction.mark()
  }

  updateHeld(delta: number): void {
    const sprite = this.sprite
    if (!sprite || !this.held) return
    const { scene, stage, bunny, speaker } = this.d
    const r = BALL_RADIUS
    const pointer = scene.input.activePointer

    const tx = Phaser.Math.Clamp(pointer.x - this.grab.x, r, stage.width - r)
    const ty = Phaser.Math.Clamp(pointer.y - this.grab.y, r, stage.floorY - r)
    const follow = 1 - Math.exp(-delta / 30)

    const px = sprite.x
    const py = sprite.y
    const nx = Phaser.Math.Linear(px, tx, follow)
    const ny = Phaser.Math.Linear(py, ty, follow)
    ;(sprite.body as Phaser.Physics.Arcade.Body).reset(nx, ny)

    const seconds = Math.max(delta, 1) / 1000
    this.throwVelocity.x = Phaser.Math.Linear(this.throwVelocity.x, (nx - px) / seconds, 0.3)
    this.throwVelocity.y = Phaser.Math.Linear(this.throwVelocity.y, (ny - py) / seconds, 0.3)
    this.refreshInterest()

    const c = bunny.body.center
    if (!this.offerSaid && !bunny.sleeping && Phaser.Math.Distance.Between(nx, ny, c.x, c.y) < OFFER_RADIUS) {
      this.offerSaid = true
      speaker.say('ballOffered', true)
    }
  }

  endDrag(): void {
    const sprite = this.sprite
    if (!sprite || !this.held) return
    const { scene, boxes, interaction } = this.d
    this.held = false
    scene.input.setDefaultCursor('')

    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.checkCollision.none = false
    body.setAllowGravity(true)
    boxes.list.forEach(b => this.rescueFromBox(b))
    body.setVelocity(
      Phaser.Math.Clamp(this.throwVelocity.x, -MAX_BALL_THROW, MAX_BALL_THROW),
      Phaser.Math.Clamp(this.throwVelocity.y, -MAX_BALL_THROW, MAX_BALL_THROW)
    )
    this.refreshInterest()
    interaction.mark()
  }

  /* ---------------- קופסאות ועולם ---------------- */

  /** אם הכדור חופף לקופסה (הוזזה/שוחררה עליו), מעמידה אותו מעליה. */
  rescueFromBox(box: PhysicsBox): void {
    const sprite = this.sprite
    if (!sprite || this.held) return
    const body = sprite.body as Phaser.Physics.Arcade.Body | null
    if (!body) return
    const overlaps = body.right > box.left && body.left < box.right && body.bottom > box.top && body.top < box.bottom
    if (!overlaps) return
    const r = BALL_RADIUS
    body.reset(Phaser.Math.Clamp(sprite.x, r, this.d.stage.width - r), Math.max(r, box.top - r))
  }

  /** מחזיר את הכדור פנימה אם גבולות העולם השתנו. */
  keepInside(): void {
    const sprite = this.sprite
    if (!sprite) return
    const { stage } = this.d
    const r = BALL_RADIUS
    const x = Phaser.Math.Clamp(sprite.x, r, stage.width - r)
    const y = Phaser.Math.Clamp(sprite.y, r, stage.floorY - r)
    if (Math.abs(x - sprite.x) > 0.1 || Math.abs(y - sprite.y) > 0.1) {
      ;(sprite.body as Phaser.Physics.Arcade.Body).reset(x, y)
    }
  }

  /* ---------------- כל פריים: גלגול, בעיטות, שעמום ---------------- */

  update(now: number, delta: number): void {
    const sprite = this.sprite
    if (!sprite) return
    const body = sprite.body as Phaser.Physics.Arcade.Body

    if (!this.held) sprite.rotation += (body.velocity.x * (delta / 1000)) / BALL_RADIUS
    this.tryKick(now, sprite, body)

    if (!this.playing(now) && !this.boredSaid) {
      this.boredSaid = true
      if (!this.d.bunny.sleeping) this.d.speaker.say('ballBored')
    }
  }

  private tryKick(now: number, sprite: Phaser.Physics.Arcade.Sprite, ball: Phaser.Physics.Arcade.Body): void {
    const { bunny, sleep, speaker } = this.d
    if (this.held || now - this.lastKick < BALL_KICK_COOLDOWN_MS) return
    if (bunny.dragging || bunny.fearing) return

    const b = bunny.body
    const touching = b.right > ball.left && b.left < ball.right && b.bottom > ball.top && b.top < ball.bottom
    if (!touching) return

    this.lastKick = now

    if (bunny.sleeping) {
      // כדור מהיר שפוגע בדמות הישנה מעיר אותה (ומקפץ ממנה בחזרה)
      if (Math.hypot(ball.velocity.x, ball.velocity.y) > 200) {
        sleep.wake('disturbed')
        ball.setVelocityX(-ball.velocity.x * 0.4)
      }
      return
    }

    const dir = Math.sign(sprite.x - b.center.x) || (Math.random() < 0.5 ? -1 : 1)
    const header = sprite.y < b.top + 8 // מרכז הכדור מעל קצה הראש

    if (header) {
      ball.setVelocity(dir * Phaser.Math.Between(80, 220), -Phaser.Math.Between(380, 520))
      speaker.say('ballHeader')
    } else {
      const power = Phaser.Math.Clamp(280 + Math.abs(b.velocity.x) * 0.8, 280, 560)
      ball.setVelocity(dir * power, -Phaser.Math.Between(220, 380))
      speaker.say('ballKick')
    }
  }

  /* ---------------- הכוונת הדמות (נקרא מה-Brain) ---------------- */

  steer(now: number): void {
    const sprite = this.sprite
    if (!sprite || !this.playing(now)) return
    const { bunny, carrots, nav } = this.d
    if (carrots.items.length > 0 || nav.goal) return // גזר וקופסאות קודמים לכדור
    if (now < bunny.dizzyUntil || bunny.leaping || !bunny.isGrounded()) return

    // נגיחה: הכדור נופל מעל הראש, קופצת לפגוש אותו
    const body = bunny.body
    const ballBody = sprite.body as Phaser.Physics.Arcade.Body
    const dx = sprite.x - body.center.x
    const gap = body.top - (sprite.y + BALL_RADIUS)
    if (!this.held && now >= this.headerCooldownUntil && Math.abs(dx) < 40 && gap > -4 && gap < 90 && ballBody.velocity.y > -50) {
      body.setVelocityY(bunny.jumpVelocity(0.55, 440))
      this.headerCooldownUntil = now + 700
    }

    // כל השאר (משטחים, קופסאות בדרך, פארקור) בניווט המשותף עם הגזר
    nav.chaseBall(sprite, this.held, now)
  }
}
