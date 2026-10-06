import Phaser from 'phaser'
import { BOX_MAX_H, BOX_MAX_W, BOX_MIN_H, BOX_MIN_W, HANDLE_SIZE, MAX_BOXES } from './constants'
import type { Bunny, Stage } from './Bunny'
import type { ContextMenu } from './UI'
import type { Speaker } from './Speaker'

/* קופסה פיזיקלית: גוף סטטי שאפשר לגרור ולשנות לו גודל */
export interface Limits {
  width: number
  floor: number
}

export interface BoxHost {
  limits(): Limits
  onChanged(box: PhysicsBox, prev: Phaser.Geom.Rectangle): void
  onMenu(box: PhysicsBox, x: number, y: number): void
}

type Corner = 'tl' | 'tr' | 'bl' | 'br'
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br']

function fitSpan(anchor: number, pointer: number, min: number, max: number, limit: number): { start: number; size: number } {
  let dir = pointer >= anchor ? 1 : -1
  let size = Phaser.Math.Clamp(Math.abs(pointer - anchor), min, max)
  let edge = anchor + dir * size

  if (edge < 0 || edge > limit) {
    edge = Phaser.Math.Clamp(edge, 0, limit)
    size = Math.abs(edge - anchor)
    if (size < min) {
      dir = -dir
      size = min
      edge = anchor + dir * size
    }
  }
  return { start: Math.min(anchor, edge), size }
}

export class PhysicsBox {
  readonly rect: Phaser.GameObjects.Rectangle
  private readonly handles = new Map<Corner, Phaser.GameObjects.Rectangle>()
  private readonly host: BoxHost
  private readonly grab = new Phaser.Math.Vector2()
  private readonly anchor = new Phaser.Math.Vector2()
  private x0: number
  private y0: number
  private w: number
  private h: number

  constructor(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    host: BoxHost,
    left: number,
    top: number,
    width: number,
    height: number
  ) {
    this.host = host
    this.x0 = left
    this.y0 = top
    this.w = width
    this.h = height

    this.rect = scene.add
      .rectangle(left + width / 2, top + height / 2, width, height, 0xc9954f)
      .setStrokeStyle(3, 0x6b4423)
      .setDepth(10)
      .setAlpha(0)
    scene.physics.add.existing(this.rect, true)
    group.add(this.rect)

    this.rect.setInteractive()
    if (this.rect.input) this.rect.input.cursor = 'move'
    scene.input.setDraggable(this.rect)

    this.rect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) this.host.onMenu(this, pointer.x, pointer.y)
    })
    this.rect.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      this.grab.set(pointer.x - this.x0, pointer.y - this.y0)
    })
    this.rect.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return
      const lim = this.host.limits()
      this.apply(
        Phaser.Math.Clamp(pointer.x - this.grab.x, 0, lim.width - this.w),
        Phaser.Math.Clamp(pointer.y - this.grab.y, 0, lim.floor - this.h),
        this.w,
        this.h
      )
    })

    for (const corner of CORNERS) {
      const handle = scene.add
        .rectangle(0, 0, HANDLE_SIZE, HANDLE_SIZE, 0xffffff)
        .setStrokeStyle(2, 0x333333)
        .setDepth(11)
        .setAlpha(0.45)
      handle.setInteractive()
      if (handle.input) handle.input.cursor = corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize'
      scene.input.setDraggable(handle)

      handle.on('pointerover', () => handle.setAlpha(1))
      handle.on('pointerout', () => handle.setAlpha(0.45))
      handle.on('dragstart', () => this.anchor.copy(this.anchorFor(corner)))
      handle.on('drag', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.leftButtonDown()) return
        const lim = this.host.limits()
        const xs = fitSpan(this.anchor.x, Phaser.Math.Clamp(pointer.x, 0, lim.width), BOX_MIN_W, BOX_MAX_W, lim.width)
        const ys = fitSpan(this.anchor.y, Phaser.Math.Clamp(pointer.y, 0, lim.floor), BOX_MIN_H, BOX_MAX_H, lim.floor)
        this.apply(xs.start, ys.start, xs.size, ys.size)
      })
      this.handles.set(corner, handle)
    }

    this.layoutHandles()
    scene.tweens.add({ targets: this.rect, alpha: 1, duration: 250 })
  }

  get left(): number {
    return this.x0
  }
  get top(): number {
    return this.y0
  }
  get width(): number {
    return this.w
  }
  get height(): number {
    return this.h
  }
  get right(): number {
    return this.x0 + this.w
  }
  get bottom(): number {
    return this.y0 + this.h
  }
  get centerX(): number {
    return this.x0 + this.w / 2
  }

  owns(go: Phaser.GameObjects.GameObject): boolean {
    return go === this.rect || Array.from(this.handles.values()).includes(go as Phaser.GameObjects.Rectangle)
  }

  scaleBy(factor: number): void {
    const lim = this.host.limits()
    const w = Phaser.Math.Clamp(this.w * factor, BOX_MIN_W, Math.min(BOX_MAX_W, lim.width))
    const h = Phaser.Math.Clamp(this.h * factor, BOX_MIN_H, Math.min(BOX_MAX_H, lim.floor))
    const cx = this.x0 + this.w / 2
    const cy = this.y0 + this.h / 2
    this.apply(Phaser.Math.Clamp(cx - w / 2, 0, lim.width - w), Phaser.Math.Clamp(cy - h / 2, 0, lim.floor - h), w, h)
  }

  clampInto(lim: Limits): void {
    const w = Math.min(this.w, lim.width)
    const h = Math.min(this.h, lim.floor)
    this.apply(Phaser.Math.Clamp(this.x0, 0, lim.width - w), Phaser.Math.Clamp(this.y0, 0, lim.floor - h), w, h)
  }

  destroy(group: Phaser.Physics.Arcade.StaticGroup): void {
    group.remove(this.rect, true, true)
    this.handles.forEach(h => h.destroy())
    this.handles.clear()
  }

  private anchorFor(corner: Corner): Phaser.Math.Vector2 {
    switch (corner) {
      case 'tl':
        return new Phaser.Math.Vector2(this.right, this.bottom)
      case 'tr':
        return new Phaser.Math.Vector2(this.x0, this.bottom)
      case 'bl':
        return new Phaser.Math.Vector2(this.right, this.y0)
      case 'br':
        return new Phaser.Math.Vector2(this.x0, this.y0)
    }
  }

  private apply(left: number, top: number, width: number, height: number): void {
    if (left === this.x0 && top === this.y0 && width === this.w && height === this.h) return

    const prev = new Phaser.Geom.Rectangle(this.x0, this.y0, this.w, this.h)
    this.x0 = left
    this.y0 = top
    this.w = width
    this.h = height

    this.rect.setPosition(left + width / 2, top + height / 2)
    this.rect.setSize(width, height)
    ;(this.rect.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject()
    this.layoutHandles()
    this.host.onChanged(this, prev)
  }

  private layoutHandles(): void {
    this.handles.get('tl')?.setPosition(this.x0, this.y0)
    this.handles.get('tr')?.setPosition(this.right, this.y0)
    this.handles.get('bl')?.setPosition(this.x0, this.bottom)
    this.handles.get('br')?.setPosition(this.right, this.bottom)
  }
}

/** נקודות חיבור למודולים אחרים (ניווט, גזרים), כדי שהמודול הזה לא יכיר אותם. */
export interface BoxEvents {
  added(box: PhysicsBox): void
  removed(box: PhysicsBox): void
  /** נקראת לפני שהדמות מתאימה את עצמה לקופסה שהמשתמש הזיז/שינה. */
  edited(box: PhysicsBox): void
}

/* ============================================================
 *  ניהול הקופסאות: יצירה, מחיקה, שאילתות מיקום והתאמת הדמות לשינויים
 * ============================================================ */
export class BoxManager {
  readonly group: Phaser.Physics.Arcade.StaticGroup
  readonly list: PhysicsBox[] = []
  events: Partial<BoxEvents> = {}

  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly stage: Stage
  private readonly speaker: Speaker
  private readonly menu: ContextMenu
  private readonly host: BoxHost

  constructor(scene: Phaser.Scene, bunny: Bunny, stage: Stage, speaker: Speaker, menu: ContextMenu) {
    this.scene = scene
    this.bunny = bunny
    this.stage = stage
    this.speaker = speaker
    this.menu = menu
    this.group = scene.physics.add.staticGroup()
    this.host = {
      limits: () => this.limits(),
      onChanged: (box, prev) => this.handleChanged(box, prev),
      onMenu: (box, x, y) =>
        this.menu.show(x, y, [{ label: 'מחק קופסה 🗑️', danger: true, onSelect: () => this.remove(box) }])
    }
  }

  limits(): Limits {
    return { width: this.stage.width, floor: this.stage.floorY }
  }

  /** אחרי שינוי גודל חלון / רצפה. */
  clampAll(): void {
    const lim = this.limits()
    this.list.forEach(b => b.clampInto(lim))
  }

  add(): void {
    if (this.list.length >= MAX_BOXES) {
      this.speaker.say('boxFull', true)
      return
    }

    const w = Phaser.Math.Between(90, 150)
    const h = Phaser.Math.Between(60, 110)
    const bx = this.bunny.sprite.x
    const preferRight = this.stage.width - bx >= bx
    const left = Phaser.Math.Clamp(preferRight ? bx + 140 : bx - 140 - w, 0, this.stage.width - w)

    const box = new PhysicsBox(this.scene, this.group, this.host, left, this.stage.floorY - h, w, h)
    this.list.push(box)
    this.rescueFromBox(box)
    this.speaker.say('boxAdded', true)
    this.events.added?.(box)
  }

  remove(box: PhysicsBox): void {
    const index = this.list.indexOf(box)
    if (index === -1) return
    this.list.splice(index, 1)
    box.destroy(this.group)
    this.events.removed?.(box)
    this.speaker.say('boxRemoved', true)
  }

  removeAll(): void {
    const all = [...this.list]
    all.forEach(b => this.remove(b))
  }

  /** הקופסה שהדמות עומדת עליה כרגע (אם בכלל). */
  perchedOn(): PhysicsBox | undefined {
    if (!this.bunny.isGrounded()) return undefined
    const b = this.bunny.body
    return this.list.find(box => Math.abs(b.bottom - box.top) <= 3 && b.right > box.left + 2 && b.left < box.right - 2)
  }

  /** בוחרת את הקופסה הקרובה ביותר מבין אלה שהיא מסוגלת לטפס עליהן. */
  pickTarget(perched: PhysicsBox | undefined): PhysicsBox | undefined {
    const body = this.bunny.body
    const candidates = this.list.filter(b => b !== perched)
    if (candidates.length === 0) return undefined

    const reachable = candidates
      .filter(b => body.bottom - b.top <= this.bunny.maxClimbRise())
      .sort((a, b) => Math.abs(a.centerX - body.center.x) - Math.abs(b.centerX - body.center.x))

    if (reachable.length === 0) {
      this.speaker.say('boxTooHigh')
      return undefined
    }
    return reachable[0]
  }

  /** הקופסה שהספרייט (גזר) מונח עליה. */
  under(sprite: Phaser.Physics.Arcade.Sprite): PhysicsBox | undefined {
    const bottom = sprite.y + sprite.displayHeight / 2
    return this.list.find(b => sprite.x >= b.left && sprite.x <= b.right && Math.abs(bottom - b.top) <= 8)
  }

  /** גלגלת עכבר מעל קופסה (או הידיות שלה) משנה את גודלה. */
  scaleUnder(over: Phaser.GameObjects.GameObject[], deltaY: number): void {
    const box = this.list.find(b => over.some(go => b.owns(go)))
    if (box) box.scaleBy(deltaY > 0 ? 0.92 : 1.08)
  }

  /** אם הדמות חופפת לקופסה, מוציאה אותה החוצה (למעלה או הצידה). */
  rescueFromBox(box: PhysicsBox, byUser = false): void {
    const b = this.bunny.body
    const bunnyRect = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height)
    const boxRect = new Phaser.Geom.Rectangle(box.left, box.top, box.width, box.height)
    if (!Phaser.Geom.Intersects.RectangleToRectangle(bunnyRect, boxRect)) return

    const sprite = this.bunny.sprite
    if (box.top >= sprite.displayHeight) {
      this.bunny.body.reset(this.bunny.clampX(sprite.x), box.top)
    } else {
      const toLeft = b.center.x < box.centerX
      const x = toLeft ? box.left - b.halfWidth - 1 : box.right + b.halfWidth + 1
      this.bunny.body.reset(this.bunny.clampX(x), sprite.y)
    }
    if (byUser) this.speaker.say('boxOnHead')
  }

  private handleChanged(box: PhysicsBox, prev: Phaser.Geom.Rectangle): void {
    this.events.edited?.(box)
    if (this.bunny.dragging) return

    const b = this.bunny.body
    const sprite = this.bunny.sprite
    const wasOnTop = Math.abs(b.bottom - prev.y) <= 4 && b.right > prev.x && b.left < prev.right
    if (wasOnTop) {
      const pureMove = Math.abs(prev.width - box.width) < 0.5 && Math.abs(prev.height - box.height) < 0.5
      const newX = pureMove ? sprite.x + (box.centerX - (prev.x + prev.width / 2)) : sprite.x
      if (newX + b.halfWidth > box.left && newX - b.halfWidth < box.right) {
        b.reset(this.bunny.clampX(newX), box.top)
        if (pureMove) this.speaker.say('boxCarried')
        else if (box.top < prev.y - 2) this.speaker.say('boxGrows')
        else if (box.top > prev.y + 2) this.speaker.say('boxShrinks')
        return
      }
    }
    this.rescueFromBox(box, true)
  }
}
