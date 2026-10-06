import Phaser from 'phaser'
import {
  BEG_EVERY_MS,
  CARROT_PICKUP_RANGE,
  CARROT_SKY_LIFETIME_MS,
  CARROT_TEXTURE_KEY,
  CARROT_USER_LIFETIME_MS,
  GIFT_RADIUS,
  HUNGER_MS,
  MAX_CARROTS,
  MAX_CARROT_THROW,
  OFFER_RADIUS,
  STUFFED_COUNT,
  STUFFED_WINDOW_MS
} from './constants'
import type { Bunny, Stage } from './Bunny'
import type { BoxManager, PhysicsBox } from './Boxes'
import type { Interaction } from './Moods'
import type { ContextMenu } from './UI'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'

export interface CarrotItem {
  sprite: Phaser.Physics.Arcade.Sprite
  collider: Phaser.Physics.Arcade.Collider
  source: 'sky' | 'user' // user = המשתמש הוסיף/הרים/הביא אותו
  expiresAt: number
  offerSaid: boolean
}

/* ============================================================
 *  גזרים: יצירה, גרירה על ידי המשתמש, אכילה, רעב ובקשות
 * ============================================================ */
export class CarrotManager {
  readonly items: CarrotItem[] = []
  held?: CarrotItem
  lastFed: number

  /** נחבר מבחוץ: מעיר את הדמות כשהיא מריחה גזר. */
  wakeBySmell: () => void = () => {}

  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly stage: Stage
  private readonly settings: SettingsStore
  private readonly speaker: Speaker
  private readonly boxes: BoxManager
  private readonly interaction: Interaction
  private readonly menu: ContextMenu

  private readonly grab = new Phaser.Math.Vector2()
  private readonly throwVelocity = new Phaser.Math.Vector2()
  private lastBeg = 0
  private eatenTimes: number[] = []

  constructor(
    scene: Phaser.Scene,
    bunny: Bunny,
    stage: Stage,
    settings: SettingsStore,
    speaker: Speaker,
    boxes: BoxManager,
    interaction: Interaction,
    menu: ContextMenu
  ) {
    this.scene = scene
    this.bunny = bunny
    this.stage = stage
    this.settings = settings
    this.speaker = speaker
    this.boxes = boxes
    this.interaction = interaction
    this.menu = menu
    this.lastFed = scene.time.now

    this.createTexture()
    this.scheduleSky()
    scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.checkHunger() })
  }

  /* ---------------- יצירה / מחיקה ---------------- */

  private createTexture(): void {
    if (this.scene.textures.exists(CARROT_TEXTURE_KEY)) return
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false)
    g.fillStyle(0xff8c1a, 1)
    g.fillTriangle(1, 10, 19, 10, 10, 40)
    g.fillStyle(0x4caf50, 1)
    g.fillTriangle(10, 11, 3, 1, 9, 1)
    g.fillTriangle(10, 11, 11, 1, 17, 1)
    g.generateTexture(CARROT_TEXTURE_KEY, 20, 41)
    g.destroy()
  }

  private scheduleSky(): void {
    this.scene.time.delayedCall(Phaser.Math.Between(40000, 90000), () => {
      if (
        this.settings.rollRandomEvent() &&
        this.items.length === 0 &&
        !this.bunny.sleeping &&
        !this.bunny.dragging &&
        !this.held
      ) {
        this.spawn('sky', Phaser.Math.Between(40, this.stage.width - 40), -30)
        this.speaker.say('carrotSpotted', true)
      }
      this.scheduleSky()
    })
  }

  addFromMenu(): void {
    if (this.items.length >= MAX_CARROTS) {
      this.speaker.say('carrotFull', true)
      return
    }
    const side = Math.random() < 0.5 ? -1 : 1
    const x = Phaser.Math.Clamp(this.bunny.sprite.x + side * Phaser.Math.Between(120, 260), 30, this.stage.width - 30)
    this.spawn('user', x, 20)

    if (this.bunny.sleeping) this.wakeBySmell()
    else this.speaker.say('carrotAdded', true)
  }

  private spawn(source: 'sky' | 'user', x: number, y: number): CarrotItem {
    const sprite = this.scene.physics.add.sprite(x, y, CARROT_TEXTURE_KEY)
    sprite.setDepth(15).setBounce(0.35).setCollideWorldBounds(true).setDragX(400).setAngle(Phaser.Math.Between(-25, 25))
    sprite.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-8, -8, sprite.width + 16, sprite.height + 16),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      cursor: 'grab'
    })

    const item: CarrotItem = {
      sprite,
      collider: this.scene.physics.add.collider(sprite, this.boxes.group),
      source,
      expiresAt: this.scene.time.now + this.lifetime(source),
      offerSaid: false
    }
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.startDrag(item, pointer)
    })
    this.items.push(item)
    return item
  }

  private lifetime(source: 'sky' | 'user'): number {
    return source === 'user' ? CARROT_USER_LIFETIME_MS : CARROT_SKY_LIFETIME_MS
  }

  expire(now: number): void {
    for (const item of [...this.items]) {
      if (item === this.held) {
        item.expiresAt = now + this.lifetime(item.source) // ביד המשתמש: לא פג תוקף
      } else if (now > item.expiresAt) {
        this.destroy(item, true)
      }
    }
  }

  private destroy(item: CarrotItem, fade: boolean): void {
    const index = this.items.indexOf(item)
    if (index === -1) return
    this.items.splice(index, 1)

    if (this.held === item) {
      this.held = undefined
      this.scene.input.setDefaultCursor('')
    }
    item.collider.destroy()
    item.sprite.disableInteractive()

    if (!fade) {
      item.sprite.destroy()
      return
    }
    this.scene.tweens.add({ targets: item.sprite, alpha: 0, duration: 600, onComplete: () => item.sprite.destroy() })
  }

  /** היעד הנרדף: הגזר הקרוב ביותר (גם אם המשתמש מחזיק אותו). */
  pickTarget(): CarrotItem | undefined {
    const c = this.bunny.body.center
    let best: CarrotItem | undefined
    let bestDist = Infinity
    for (const item of this.items) {
      const d = Phaser.Math.Distance.Between(item.sprite.x, item.sprite.y, c.x, c.y)
      if (d < bestDist) {
        bestDist = d
        best = item
      }
    }
    return best
  }

  /* ---------------- גרירת גזר על ידי המשתמש ---------------- */

  startDrag(item: CarrotItem, pointer: Phaser.Input.Pointer): void {
    if (this.bunny.dragging || this.held) return
    this.menu.hide()
    this.held = item
    item.source = 'user'
    item.offerSaid = false
    this.grab.set(pointer.x - item.sprite.x, pointer.y - item.sprite.y)
    this.throwVelocity.set(0, 0)

    const body = item.sprite.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setVelocity(0, 0)
    body.checkCollision.none = true
    this.scene.input.setDefaultCursor('grabbing')
    this.interaction.mark()
  }

  updateHeld(delta: number): void {
    const item = this.held
    if (!item) return

    const s = item.sprite
    const pointer = this.scene.input.activePointer
    const halfW = s.displayWidth / 2
    const halfH = s.displayHeight / 2
    const tx = Phaser.Math.Clamp(pointer.x - this.grab.x, halfW, this.stage.width - halfW)
    const ty = Phaser.Math.Clamp(pointer.y - this.grab.y, halfH, this.stage.floorY - halfH)
    const follow = 1 - Math.exp(-delta / 30)

    const px = s.x
    const py = s.y
    const nx = Phaser.Math.Linear(px, tx, follow)
    const ny = Phaser.Math.Linear(py, ty, follow)
    ;(s.body as Phaser.Physics.Arcade.Body).reset(nx, ny)

    const seconds = Math.max(delta, 1) / 1000
    this.throwVelocity.x = Phaser.Math.Linear(this.throwVelocity.x, (nx - px) / seconds, 0.3)
    this.throwVelocity.y = Phaser.Math.Linear(this.throwVelocity.y, (ny - py) / seconds, 0.3)
    s.angle = Phaser.Math.Linear(s.angle, Phaser.Math.Clamp(this.throwVelocity.x * 0.04, -35, 35), 0.2)

    // מחזיק גזר קרוב אליה: היא מבקשת אותו
    const c = this.bunny.body.center
    if (!item.offerSaid && !this.bunny.sleeping && Phaser.Math.Distance.Between(nx, ny, c.x, c.y) < OFFER_RADIUS) {
      item.offerSaid = true
      this.speaker.say('carrotOffered', true)
    }
  }

  endDrag(): void {
    const item = this.held
    if (!item) return
    this.held = undefined
    this.scene.input.setDefaultCursor('')

    const body = item.sprite.body as Phaser.Physics.Arcade.Body
    body.checkCollision.none = false
    body.setAllowGravity(true)
    this.boxes.list.forEach(b => this.rescueFromBox(item, b))
    body.setVelocity(
      Phaser.Math.Clamp(this.throwVelocity.x, -MAX_CARROT_THROW, MAX_CARROT_THROW),
      Phaser.Math.Clamp(this.throwVelocity.y, -MAX_CARROT_THROW, MAX_CARROT_THROW)
    )
    this.interaction.mark()

    // "הביא לה גזר": הפיל אותו לידה
    const c = this.bunny.body.center
    const near = Phaser.Math.Distance.Between(item.sprite.x, item.sprite.y, c.x, c.y) < GIFT_RADIUS
    if (near && !item.offerSaid && !this.bunny.sleeping) this.speaker.say('carrotGift', true)
  }

  private rescueFromBox(item: CarrotItem, box: PhysicsBox): void {
    const body = item.sprite.body as Phaser.Physics.Arcade.Body | null
    if (!body) return
    const carrotRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
    const boxRect = new Phaser.Geom.Rectangle(box.left, box.top, box.width, box.height)
    if (!Phaser.Geom.Intersects.RectangleToRectangle(carrotRect, boxRect)) return

    const half = item.sprite.displayHeight / 2
    body.reset(Phaser.Math.Clamp(item.sprite.x, 10, this.stage.width - 10), Math.max(half, box.top - half))
  }

  /** קופסה השתנתה: מוציאה ממנה גזרים (חוץ מזה שבידי המשתמש). */
  rescueAllFromBox(box: PhysicsBox): void {
    this.items.forEach(c => {
      if (c !== this.held) this.rescueFromBox(c, box)
    })
  }

  /* ---------------- אכילה, תודה ורעב ---------------- */

  /** מרחק בין גוף הדמות לגזר (0 אם חופפים). */
  pickupDistance(item: CarrotItem): number {
    const body = this.bunny.body
    const s = item.sprite
    const bunnyRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
    const carrotRect = new Phaser.Geom.Rectangle(
      s.x - s.displayWidth / 2,
      s.y - s.displayHeight / 2,
      s.displayWidth,
      s.displayHeight
    )

    if (Phaser.Geom.Intersects.RectangleToRectangle(bunnyRect, carrotRect)) return 0

    const dx = Math.max(carrotRect.left - bunnyRect.right, 0, bunnyRect.left - carrotRect.right)
    const dy = Math.max(carrotRect.top - bunnyRect.bottom, 0, bunnyRect.top - carrotRect.bottom)
    return Math.hypot(dx, dy)
  }

  checkEat(): void {
    if (this.bunny.sleeping) return

    for (const item of [...this.items]) {
      if (this.pickupDistance(item) <= CARROT_PICKUP_RANGE) {
        this.eat(item)
        return
      }
    }
  }

  eat(item: CarrotItem): void {
    const now = this.scene.time.now
    const fromHand = this.held === item
    const fromUser = item.source === 'user'
    this.destroy(item, false)

    this.lastFed = now
    this.eatenTimes = this.eatenTimes.filter(t => now - t < STUFFED_WINDOW_MS)
    this.eatenTimes.push(now)

    if (this.eatenTimes.length >= STUFFED_COUNT) this.speaker.say('stuffed', true)
    else if (fromHand) this.speaker.say('thanksHand', true)
    else if (fromUser) this.speaker.say('thanks', true)
    else this.speaker.say('eat', true)

    this.bunny.endLeap()
    this.bunny.body.setVelocityX(0)
    this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.62, 300))
  }

  /** רעבה: מבקשת גזר מדי פעם (בתדירות כפולה אם העכבר קרוב אליה). */
  private checkHunger(): void {
    if (!this.settings.get().hungerEnabled || this.items.length > 0 || this.bunny.sleeping || this.bunny.dragging) return
    const now = this.scene.time.now
    if (now - this.lastFed < HUNGER_MS) return

    const pointer = this.scene.input.activePointer
    const c = this.bunny.body.center
    const eager = this.interaction.pointerSeen && Phaser.Math.Distance.Between(pointer.x, pointer.y, c.x, c.y) < 300
    if (now - this.lastBeg < (eager ? BEG_EVERY_MS / 2 : BEG_EVERY_MS)) return

    this.lastBeg = now
    this.speaker.say('beg', true)
    this.showThought()
    if (this.bunny.isGrounded()) this.bunny.body.setVelocityY(this.bunny.jumpVelocity(0.28, 360))
  }

  private showThought(): void {
    const sprite = this.bunny.sprite
    const x = Phaser.Math.Clamp(sprite.x + 28, 20, this.stage.width - 20)
    const y = Math.max(sprite.y - sprite.displayHeight - 40, 80)
    const icon = this.scene.add.image(x, y, CARROT_TEXTURE_KEY).setDepth(100)
    this.scene.tweens.add({ targets: icon, y: icon.y - 50, alpha: 0, duration: 1800, onComplete: () => icon.destroy() })
  }
}
