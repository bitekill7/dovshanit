import Phaser from 'phaser'
import { CARROT_PICKUP_RANGE, GRAVITY_Y, LEAP_APEX_MARGIN, LEAP_STANDOFF_BASE, MAX_LEAP_VX } from './constants'
import type { Bunny, JumpGeometry, Stage } from './Bunny'
import type { BoxManager, PhysicsBox } from './Boxes'
import type { CarrotItem, CarrotManager } from './Carrots'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'

interface ChaseMode {
  /** מותרת קפיצה בליסטית אל מטרה שגבוהה מהמשטח או תלויה באוויר. */
  leap: boolean
  /** מטרה שנופלת: הולכים ישר מתחתיה (מתאים לגזר נופל). */
  trackFalling: boolean
  /** האם המטרה היא כדור (מאפשר נגיחה/פגיעה באוויר). */
  isBall?: boolean
}

export interface BoxGoal {
  box: PhysicsBox
  until: number
}

/* ============================================================
 *  ניווט: הליכה ליעד, טיפוס על קופסאות, פארקור בין משטחים,
 *  קפיצה בליסטית וירידה מבוקרת מגובה.
 * ============================================================ */
export class Navigator {
  goal?: BoxGoal
  perchUntil = 0

  private readonly bunny: Bunny
  private readonly stage: Stage
  private readonly settings: SettingsStore
  private readonly speaker: Speaker
  private readonly boxes: BoxManager
  private readonly carrots: CarrotManager

  private leapCooldownUntil = 0
  private standoffBonus = 0
  private parkourRoute: PhysicsBox[] = []
  private parkourSignature = ''
  private parkourRouteUntil = 0
  /** קופסאות שכבר עמדה עליהן בדרך ליעד הנוכחי: מונע פינג-פונג בין שתיים. */
  private parkourTrail: PhysicsBox[] = []
  private parkourTrailKey = ''
  /** בזמן רדיפה הולכים במהירות הרדיפה. */
  private fastWalk = false

  /**
   * נעילת קצה בזמן ירידה מקופסה.
   * מונעת החלפת צד מהירה כשהארנבת נמצאת בדיוק באזור הקצה.
   */
  private dropOffBox?: PhysicsBox
  private dropOffX = 0

  constructor(
    bunny: Bunny,
    stage: Stage,
    settings: SettingsStore,
    speaker: Speaker,
    boxes: BoxManager,
    carrots: CarrotManager
  ) {
    this.bunny = bunny
    this.stage = stage
    this.settings = settings
    this.speaker = speaker
    this.boxes = boxes
    this.carrots = carrots
  }

  /* ---------------- יעד קופסה ---------------- */

  setGoal(box: PhysicsBox, now: number): void {
    this.goal = { box, until: now + 12000 }
    this.standoffBonus = 0
    this.clearDropOffLock()
  }

  clearGoal(): void {
    this.goal = undefined
    this.clearDropOffLock()
  }

  clearGoalIf(box: PhysicsBox): void {
    if (this.goal?.box === box) this.goal = undefined
  }

  clearRoute(): void {
    this.parkourRoute.length = 0
    this.parkourSignature = ''
    this.parkourRouteUntil = 0
    this.parkourTrail.length = 0
    this.parkourTrailKey = ''
    this.clearDropOffLock()
  }

  private clearDropOffLock(): void {
    this.dropOffBox = undefined
    this.dropOffX = 0
  }

  private getLockedDropOffX(currentBox: PhysicsBox, targetX: number): number {
    if (this.dropOffBox !== currentBox) {
      this.dropOffBox = currentBox
      this.dropOffX = this.getDropOffX(currentBox, targetX)
    }

    return this.dropOffX
  }

  /* ---------------- הכוונה ראשית ---------------- */

  steer(now: number): void {
    if (now < this.bunny.dizzyUntil || !this.bunny.isGrounded()) return

    const carrot = this.carrots.pickTarget()
    if (carrot) {
      this.steerToCarrot(carrot, now)
      return
    }

    const goal = this.goal
    if (!goal) return

    if (now > goal.until || !this.boxes.list.includes(goal.box)) {
      this.goal = undefined
      return
    }
    if (this.boxes.perchedOn() === goal.box) {
      this.goal = undefined
      this.perchUntil = now + Phaser.Math.Between(4000, 9000)
      this.bunny.body.setVelocityX(0)
      this.speaker.say('boxClimb', true)
      return
    }
    this.seekPlatform(goal.box, now)
  }

  private walkToward(x: number): void {
    const settings = this.settings.get()
    const speed = this.fastWalk || this.carrots.items.length > 0 ? settings.chaseSpeed : settings.walkSpeed
    const dx = x - this.bunny.body.center.x
    this.bunny.body.setVelocityX(Math.abs(dx) < 8 ? 0 : Math.sign(dx) * speed)
  }

  private currentSurfaceY(box?: PhysicsBox): number {
    return box ? box.top : this.stage.floorY
  }

  /**
   * מחשב את קצה הקופסה הבטוח והקרוב ביותר לירידה ממנה כשהמטרה נמצאת מתחתיה.
   */
  private getDropOffX(currentBox: PhysicsBox, targetX: number): number {
    const half = this.bunny.body.halfWidth
    const margin = half + 14
    const leftEdge = currentBox.left - margin
    const rightEdge = currentBox.right + margin

    const canDropLeft = leftEdge >= half
    const canDropRight = rightEdge <= this.stage.width - half

    if (canDropLeft && canDropRight) {
      return Math.abs(leftEdge - targetX) < Math.abs(rightEdge - targetX) ? leftEdge : rightEdge
    }
    if (canDropLeft) return leftEdge
    if (canDropRight) return rightEdge
    return targetX
  }

  /* ---------------- מכשולים ומסלולי פארקור ---------------- */

  private horizontalBlockerBetween(fromX: number, targetX: number, surfaceY: number, ignore?: PhysicsBox): PhysicsBox | undefined {
    const x1 = Math.min(fromX, targetX)
    const x2 = Math.max(fromX, targetX)
    return this.boxes.list.find(
      box =>
        box !== ignore &&
        box.right > x1 + 2 &&
        box.left < x2 - 2 &&
        box.top < surfaceY - 8 &&
        box.bottom > surfaceY - this.bunny.body.height + 8
    )
  }

  private blockingBox(targetX: number): PhysicsBox | undefined {
    return this.horizontalBlockerBetween(
      this.bunny.body.center.x,
      targetX,
      this.bunny.body.bottom,
      this.boxes.perchedOn()
    )
  }

  private leapPathClear(
    takeoffX: number,
    landingX: number,
    geometry: JumpGeometry,
    fromY: number,
    target: PhysicsBox,
    ignore?: PhysicsBox
  ): boolean {
    const half = this.bunny.body.halfWidth
    const span = Math.abs(landingX - takeoffX)
    const dir = Math.sign(landingX - takeoffX) || 1
    const vx = Math.min(MAX_LEAP_VX, span / geometry.time)
    const v0 = -geometry.vy
    const heightAt = (t: number): number => v0 * t - 0.5 * GRAVITY_Y * t * t

    for (const box of this.boxes.list) {
      if (box === target || box === ignore) continue
      const rise = fromY - box.top
      if (rise <= 4) continue
      const nearEdge = dir > 0 ? box.left : box.right
      const farEdge = dir > 0 ? box.right : box.left
      const nearDist = (nearEdge - takeoffX) * dir - half
      const farDist = (farEdge - takeoffX) * dir + half
      if (farDist <= 0 || nearDist >= span + half) continue
      if (vx <= 0) return false
      const tNear = Math.max(0, nearDist) / vx
      const tFar = Math.min(farDist / vx, geometry.time)
      if (heightAt(tNear) < rise + 4 || heightAt(tFar) < rise + 4) return false
    }
    return true
  }

  private takeoffSpotOccupied(x: number, target: PhysicsBox): boolean {
    const body = this.bunny.body
    const half = body.halfWidth
    const perched = this.boxes.perchedOn()
    return this.boxes.list.some(
      o =>
        o !== target &&
        o !== perched &&
        o.top < body.bottom - 8 &&
        o.bottom > body.bottom - body.height + 8 &&
        x + half > o.left &&
        x - half < o.right
    )
  }

  private platformLandingX(box: PhysicsBox, fromX: number): number {
    const margin = Math.min(Math.max(this.bunny.body.halfWidth + 8, 16), box.width / 2)
    if (box.width <= margin * 2) return box.centerX
    return Phaser.Math.Clamp(fromX, box.left + margin, box.right - margin)
  }

  private canJumpToPlatform(fromBox: PhysicsBox | undefined, target: PhysicsBox): boolean {
    if (!this.boxes.list.includes(target)) return false
    if (fromBox === target) return true

    const fromY = this.currentSurfaceY(fromBox)
    const rise = fromY - target.top
    const maxDrop = Math.max(200, this.bunny.maxJumpHeight() * 1.5)

    if (rise < 0) {
      return Math.abs(rise) <= maxDrop
    }

    if (rise > this.bunny.maxClimbRise()) return false

    const geometry = this.bunny.jumpGeometry(rise)
    if (!geometry) return false

    const fromX = fromBox?.centerX ?? this.bunny.body.center.x
    const half = this.bunny.body.halfWidth
    const side = fromX < target.centerX ? -1 : 1
    const standoff = LEAP_STANDOFF_BASE + 0.3 * Math.max(rise, 0)
    const desiredTakeoff = side < 0 ? target.left - half - standoff : target.right + half + standoff
    const takeoffX = Phaser.Math.Clamp(desiredTakeoff, half, this.stage.width - half)
    const landingX = this.platformLandingX(target, takeoffX)
    const maxHorizontal = MAX_LEAP_VX * geometry.time + 24
    if (Math.abs(landingX - takeoffX) > maxHorizontal) return false
    return this.leapPathClear(takeoffX, landingX, geometry, fromY, target, fromBox)
  }

  private targetReachableFromPlatform(fromBox: PhysicsBox | undefined, targetX: number, targetY: number): boolean {
    const fromY = this.currentSurfaceY(fromBox)
    const fromX = fromBox?.centerX ?? this.bunny.body.center.x
    const rise = fromY - targetY

    if (rise < -20) {
      // אם אנחנו על קופסה והמטרה מתחתיה, לא נחשב כהגעה כל עוד לא ירדנו מהקופסה
      if (fromBox && targetX >= fromBox.left - 8 && targetX <= fromBox.right + 8) {
        return false
      }
      return Math.abs(rise) <= 500
    }

    if (rise <= 18) {
      return !this.horizontalBlockerBetween(fromX, targetX, fromY, fromBox)
    }

    if (rise > this.bunny.maxClimbRise()) return false

    const geometry = this.bunny.jumpGeometry(rise)
    if (!geometry) return false
    const half = this.bunny.body.halfWidth
    const maxHorizontal = MAX_LEAP_VX * geometry.time + 25
    const takeoffDistance = Math.max(0, Math.abs(targetX - fromX) - half)
    return takeoffDistance <= maxHorizontal
  }

  private findParkourRoute(targetX: number, targetY: number, targetBox?: PhysicsBox): PhysicsBox[] {
    if (!this.settings.get().smartParkourEnabled) return []

    const start = this.boxes.perchedOn()
    if (start && this.parkourTrail[this.parkourTrail.length - 1] !== start) {
      this.parkourTrail.push(start)
      if (this.parkourTrail.length > 6) this.parkourTrail.shift()
    }

    const queue: Array<{ box?: PhysicsBox; path: PhysicsBox[]; score: number }> = [{
      box: start,
      path: [],
      score: 0
    }]

    const visited = new Set<PhysicsBox>(start ? [start] : [])
    let bestFallback: { path: PhysicsBox[]; score: number } | undefined

    while (queue.length > 0) {
      queue.sort((a, b) => a.score - b.score)
      const current = queue.shift()!

      if (targetBox && current.box === targetBox) return current.path
      if (this.targetReachableFromPlatform(current.box, targetX, targetY)) return current.path

      const candidates = this.boxes.list
        .filter(box => !visited.has(box) && box !== current.box)
        .filter(box => this.canJumpToPlatform(current.box, box))
        .sort((a, b) => {
          const distA = Math.abs(a.centerX - targetX) + Math.abs(a.top - targetY)
          const distB = Math.abs(b.centerX - targetX) + Math.abs(b.top - targetY)
          return distA - distB
        })

      for (const next of candidates) {
        visited.add(next)
        const path = [...current.path, next]
        const distanceToTarget = Math.abs(next.centerX - targetX) + Math.abs(next.top - targetY)
        const revisitPenalty = this.parkourTrail.includes(next) ? 400 : 0
        const score = path.length * 200 + distanceToTarget + revisitPenalty
        const candidate = { path, score }

        if (!this.parkourTrail.includes(next) && (!bestFallback || score < bestFallback.score)) {
          bestFallback = candidate
        }
        queue.push({ box: next, path, score })
      }
    }

    return bestFallback ? [bestFallback.path[0]] : []
  }

  private parkourSignatureFor(targetX: number, targetY: number, targetBox?: PhysicsBox): string {
    const boxPart = targetBox
      ? `${targetBox.left.toFixed(0)}:${targetBox.top.toFixed(0)}:${targetBox.width.toFixed(0)}:${targetBox.height.toFixed(0)}`
      : 'none'
    return `${Math.round(targetX / 30)}:${Math.round(targetY / 30)}:${boxPart}`
  }

  private steerThroughParkour(targetX: number, targetY: number, targetBox: PhysicsBox | undefined, now: number): boolean {
    if (!this.settings.get().smartParkourEnabled) return false

    const current = this.boxes.perchedOn()
    if (targetBox && current === targetBox) {
      this.clearRoute()
      this.walkToward(targetX)
      return true
    }

    const signature = this.parkourSignatureFor(targetX, targetY, targetBox)
    if (
      signature !== this.parkourSignature ||
      now >= this.parkourRouteUntil ||
      this.parkourRoute.some(box => !this.boxes.list.includes(box))
    ) {
      const trailKey = targetBox
        ? `box:${targetBox.left.toFixed(0)}:${targetBox.top.toFixed(0)}`
        : `pt:${Math.round(targetX / 100)}:${Math.round(targetY / 100)}`
      if (trailKey !== this.parkourTrailKey) {
        this.parkourTrail.length = 0
        this.parkourTrailKey = trailKey
      }
      this.parkourSignature = signature
      this.parkourRoute = this.findParkourRoute(targetX, targetY, targetBox)
      this.parkourRouteUntil = now + 600
    }

    while (this.parkourRoute.length > 0 && this.boxes.perchedOn() === this.parkourRoute[0]) {
      this.parkourRoute.shift()
    }

    const next = this.parkourRoute[0]
    if (!next) return false

    this.seekPlatform(next, now)
    return true
  }

  /* ---------------- רדיפה אחרי גזר ---------------- */

  private steerToCarrot(item: CarrotItem, now: number): void {
    if (this.carrots.pickupDistance(item) <= CARROT_PICKUP_RANGE) {
      this.carrots.eat(item)
      return
    }
    this.chase(item.sprite, this.carrots.held === item, now, { leap: true, trackFalling: true })
  }

  /**
   * רדיפה אחרי כדור.
   */
  chaseBall(sprite: Phaser.Physics.Arcade.Sprite, held: boolean, now: number): void {
    this.chase(sprite, held, now, { leap: true, trackFalling: false, isBall: true })
  }

  private chase(s: Phaser.Physics.Arcade.Sprite, held: boolean, now: number, mode: ChaseMode): void {
    this.fastWalk = true
    try {
      this.chaseCore(s, held, now, mode)
    } finally {
      this.fastWalk = false
    }
  }

  private chaseCore(s: Phaser.Physics.Arcade.Sprite, held: boolean, now: number, mode: ChaseMode): void {
    const body = this.bunny.body
    const currentPlatform = this.boxes.perchedOn()

    const sBody = s.body as Phaser.Physics.Arcade.Body | null
    let predictedX = s.x
    let predictedY = s.y
    if (sBody && !held) {
      const dt = 0.2
      predictedX = Phaser.Math.Clamp(s.x + sBody.velocity.x * dt, body.halfWidth, this.stage.width - body.halfWidth)
      predictedY = s.y + sBody.velocity.y * dt
    }

    const platform = held ? currentPlatform : this.boxes.under(s)

    // לא משחררים את הנעילה בגלל פריים בודד שבו perchedOn() לא זיהה את הקופסה.
    // משחררים רק כשעברנו לקופסה אחרת או שבאמת יצאנו אופקית מהקופסה.
    if (this.dropOffBox && currentPlatform !== this.dropOffBox) {
      const dropBox = this.dropOffBox
      const half = body.halfWidth
      const trulyOutside =
        body.center.x < dropBox.left - half - 2 ||
        body.center.x > dropBox.right + half + 2

      if (currentPlatform || trulyOutside) {
        this.clearDropOffLock()
      }
    }

    // אם כבר בחרנו קצה לירידה, זה מקבל עדיפות מלאה על פני
    // חישוב היעד הרגיל. חשוב במיוחד אחרי שהארנבת כבר עברה
    // את קצה הקופסה: בשלב הזה predictedX כבר מחוץ לקופסה,
    // ולכן אסור לחזור ללוגיקת המעקב ולגרום להיפוך כיוון.
    if (this.dropOffBox && currentPlatform === this.dropOffBox) {
      const stillNeedsDrop = predictedY > currentPlatform.bottom + 12

      if (stillNeedsDrop) {
        this.walkToward(this.dropOffX)
        return
      }

      // היעד כבר לא מתחת לקופסה — זו כבר החלטת ניווט חדשה.
      this.clearDropOffLock()
    }

    const falling = mode.trackFalling && !held && !!sBody && Math.abs(sBody.velocity.y) > 30
    if (falling) {
      this.walkToward(predictedX)
      return
    }

    // מקרה ירידה: המטרה מתחת לקופסה שהארנבת עומדת עליה.
    // ברגע שנכנסנו למצב הזה נועלים את קצה הירידה.
    const inDropZone =
      !!currentPlatform &&
      predictedY > currentPlatform.bottom + 12 &&
      predictedX >= currentPlatform.left - 8 &&
      predictedX <= currentPlatform.right + 8

    if (inDropZone && currentPlatform) {
      const dropX = this.getLockedDropOffX(currentPlatform, predictedX)
      this.walkToward(dropX)
      return
    }

    const currentSurface = this.currentSurfaceY(currentPlatform)
    const riseToTarget = currentSurface - predictedY

    if (
      (platform && currentPlatform !== platform) ||
      riseToTarget > this.bunny.maxClimbRise() ||
      (this.blockingBox(predictedX) && !this.targetReachableFromPlatform(currentPlatform, predictedX, predictedY))
    ) {
      if (this.steerThroughParkour(predictedX, predictedY, platform, now)) return
      if (platform) {
        this.seekPlatform(platform, now)
        return
      }
    }

    const sameSurface = platform === currentPlatform || (!platform && !currentPlatform)

    if (sameSurface || this.targetReachableFromPlatform(currentPlatform, predictedX, predictedY)) {
      if (this.blockingBox(predictedX) && this.steerAroundBlocker(s, now)) return

      const dx = predictedX - body.center.x
      this.walkToward(predictedX)

      if (!mode.leap) return

      const targetBottom = predictedY + body.halfHeight
      const rise = body.bottom - targetBottom

      if (rise > 18 && now >= this.leapCooldownUntil) {
        if (rise <= this.bunny.maxClimbRise()) {
          const geometry = this.bunny.jumpGeometry(rise)
          if (geometry) {
            const maxHorizontal = MAX_LEAP_VX * geometry.time + 20
            if (Math.abs(dx) <= maxHorizontal) {
              const vx = Phaser.Math.Clamp(dx / geometry.time, -MAX_LEAP_VX, MAX_LEAP_VX)
              body.setVelocityX(vx)
              this.leapCooldownUntil = now + 750
              this.bunny.beginLeap(now)
              body.setVelocityY(geometry.vy)
              return
            }
          }
        } else if (!mode.isBall) {
          this.speaker.say('carrotTooHigh')
        }
      }
      return
    }

    if (this.steerAroundBlocker(s, now)) return
    this.walkToward(predictedX)
  }

  private steerAroundBlocker(s: Phaser.Physics.Arcade.Sprite, now: number): boolean {
    const body = this.bunny.body
    const blocker = this.blockingBox(s.x)
    if (this.settings.get().smartParkourEnabled && this.steerThroughParkour(s.x, s.y, undefined, now)) return true

    if (blocker) {
      if (body.bottom - blocker.top <= this.bunny.maxClimbRise()) {
        this.seekPlatform(blocker, now)
      } else {
        this.walkToward(s.x)
        this.speaker.say('blockedByBox')
      }
      return true
    }
    return false
  }

  /* ---------------- טיפוס/ירידה לקופסה ---------------- */

  private seekPlatform(box: PhysicsBox, now: number): void {
    const body = this.bunny.body
    const currentBox = this.boxes.perchedOn()

    // ירידה לקופסה נמוכה יותר.
    // נועלים את הקצה פעם אחת וממשיכים אליו עד שהארנבת באמת יורדת.
    if (currentBox && box.top > currentBox.bottom + 12) {
      const dropX = this.getLockedDropOffX(currentBox, box.centerX)
      this.walkToward(dropX)
      return
    }

    const rise = body.bottom - box.top

    if (rise <= 8) {
      this.walkToward(box.centerX)
      return
    }
    if (rise > this.bunny.maxClimbRise()) {
      body.setVelocityX(0)
      this.clearGoalIf(box)
      this.speaker.say('boxTooHigh')
      return
    }

    const half = body.halfWidth
    const standoff = LEAP_STANDOFF_BASE + this.standoffBonus + 0.3 * rise
    const options = [-1, 1]
      .map(side => ({ side, x: side < 0 ? box.left - half - standoff : box.right + half + standoff }))
      .filter(o => o.x >= half && o.x <= this.stage.width - half)
      .filter(o => !this.takeoffSpotOccupied(o.x, box))
      .sort((a, b) => Math.abs(a.x - body.center.x) - Math.abs(b.x - body.center.x))

    const choice = options[0]
    if (!choice) {
      if (box.width > half * 2 + 8 && Math.abs(body.center.x - box.centerX) < box.width / 2 + 40) {
        this.walkToward(box.centerX)
      } else {
        this.standoffBonus = Math.min(this.standoffBonus + 20, 120)
      }
      return
    }

    if (Math.abs(body.center.x - choice.x) > 10) {
      const blocker = this.horizontalBlockerBetween(body.center.x, choice.x, body.bottom, this.boxes.perchedOn())
      if (blocker && blocker !== box && body.bottom - blocker.top <= this.bunny.maxClimbRise()) {
        this.seekPlatform(blocker, now)
        return
      }
      this.walkToward(choice.x)
      return
    }

    body.setVelocityX(0)
    if (now < this.leapCooldownUntil) return
    this.leapCooldownUntil = now + 900
    if (!this.planLeap(box, choice.side, now)) this.standoffBonus = Math.min(this.standoffBonus + 20, 120)
  }

  private planLeap(box: PhysicsBox, side: number, now: number): boolean {
    const body = this.bunny.body
    const rise = body.bottom - box.top
    if (rise > this.bunny.maxClimbRise()) return false

    const margin = body.halfWidth + 10
    const landingX = box.width > margin * 2 ? (side < 0 ? box.left + margin : box.right - margin) : box.centerX
    const geometry = this.bunny.jumpGeometry(rise)
    if (!geometry) return false

    if (!this.leapPathClear(body.center.x, landingX, geometry, body.bottom, box, this.boxes.perchedOn())) return false

    const vx = Phaser.Math.Clamp((landingX - body.center.x) / geometry.time, -MAX_LEAP_VX, MAX_LEAP_VX)
    const tClear = Math.max(
      0.05,
      (geometry.vy * -1 - Math.sqrt(Math.max(0, 2 * GRAVITY_Y * (LEAP_APEX_MARGIN * 0.75)))) / GRAVITY_Y
    )
    const xAtClear = body.center.x + vx * tClear
    const clears = side < 0 ? xAtClear + body.halfWidth <= box.left + 6 : xAtClear - body.halfWidth >= box.right - 6
    if (!clears) return false

    this.bunny.beginLeap(now)
    body.setVelocity(vx, geometry.vy)
    this.standoffBonus = 0
    return true
  }
}