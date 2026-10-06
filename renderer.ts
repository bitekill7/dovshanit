import '../assets/main.css'
import Phaser from 'phaser'
import dovshanitImg from '../assets/dovshanit.png'
import { Ball } from './Ball'
import { BoxManager } from './Boxes'
import { Brain } from './Brain'
import { Bunny, type Stage } from './Bunny'
import { BunnyFx } from './BunnyFx'
import { CarrotManager } from './Carrots'
import { ContextMenu, SettingsPanel, type MenuAction } from './UI'
import { DragController } from './DragController'
import { Attention, Interaction, Sleep } from './Moods'
import { Navigator } from './Navigator'
import { Petting } from './Petting'
import { SettingsStore } from './SettingsStore'
import { Speaker } from './Speaker'
import { BUNNY_TEXTURE_KEY, DRAG_X, GRAVITY_Y, MAX_FLEE_SPEED } from './constants'
import { closeApp, computeFloorY } from './platform'
import { greetingPhrases } from './phrases'
import { CreditsPanel } from './CreditsPanel'
/* ============================================================
 *  הסצנה: רק מחברת בין המודולים. כל ההתנהגויות חיות בקבצים שלהן.
 * ============================================================ */
class DovshanitScene extends Phaser.Scene {
  private readonly stage: Stage = { width: 0, floorY: 0 }
  private readonly settings = new SettingsStore()

  private settingsPanel?: SettingsPanel
  private creditsPanel?: CreditsPanel
  private menu!: ContextMenu
  private bunny!: Bunny
  private speaker!: Speaker
  private interaction!: Interaction
  private boxes!: BoxManager
  private carrots!: CarrotManager
  private ball!: Ball
  private pet!: Petting
  private nav!: Navigator
  private fx!: BunnyFx
  private sleep!: Sleep
  private drag!: DragController
  private brain!: Brain

  constructor() {
    super('DovshanitScene')
  }

  /* ---------------- עולם ---------------- */

  private syncStageSize(): void {
    this.stage.width = this.scale.width
  }

  private applyWorldBounds(): void {
    this.physics.world.setBounds(0, 0, this.stage.width, this.stage.floorY)
    this.boxes?.clampAll()
    this.bunny?.keepInside()
    this.ball?.keepInside()
  }

  private readonly onWindowResize = (): void => {
    this.scale.resize(window.innerWidth, window.innerHeight)
    this.syncStageSize()
    this.stage.floorY = computeFloorY()
    this.applyWorldBounds()
  }

  private readonly onGameBlur = (): void => {
    this.drag.end()
    this.carrots.endDrag()
    this.ball.endDrag()
  }

  private refreshFloor(): void {
    const next = computeFloorY()
    if (Math.abs(next - this.stage.floorY) < 1) return
    this.stage.floorY = next
    this.applyWorldBounds()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      !event.shiftKey ||
      event.code !== 'KeyP' ||
      event.repeat
    ) {
      return
    }
  
    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return
    }
  
    event.preventDefault()
    this.menu.showCentered(this.mainMenuActions())
  }
  /* ---------------- מחזור חיים ---------------- */

  preload(): void {
    this.load.image(BUNNY_TEXTURE_KEY, dovshanitImg)
  }

  create(): void {
    this.syncStageSize()
    this.stage.floorY = computeFloorY()
    this.physics.world.setBounds(0, 0, this.stage.width, this.stage.floorY)

    this.menu = new ContextMenu()
    this.settingsPanel = new SettingsPanel(this.settings, () => this.applySettings())
    this.creditsPanel = new CreditsPanel()

    this.bunny = new Bunny(this, this.settings, this.stage)
    this.speaker = new Speaker(this, this.bunny, this.settings, this.stage)
    this.interaction = new Interaction(this, this.speaker)
    this.boxes = new BoxManager(this, this.bunny, this.stage, this.speaker, this.menu)
    this.physics.add.collider(this.bunny.sprite, this.boxes.group)

    this.carrots = new CarrotManager(
      this,
      this.bunny,
      this.stage,
      this.settings,
      this.speaker,
      this.boxes,
      this.interaction,
      this.menu
    )
    this.nav = new Navigator(this.bunny, this.stage, this.settings, this.speaker, this.boxes, this.carrots)
    this.fx = new BunnyFx(this, this.bunny, this.speaker, this.boxes)
    this.sleep = new Sleep(this, this.bunny, this.speaker, this.carrots, this.interaction)
    this.carrots.wakeBySmell = () => this.sleep.wake('smell')
    this.ball = new Ball({
      scene: this,
      bunny: this.bunny,
      stage: this.stage,
      settings: this.settings,
      speaker: this.speaker,
      boxes: this.boxes,
      carrots: this.carrots,
      interaction: this.interaction,
      menu: this.menu,
      nav: this.nav,
      sleep: this.sleep
    })
    this.drag = new DragController(
      this,
      this.bunny,
      this.stage,
      this.speaker,
      this.interaction,
      this.menu,
      this.boxes,
      this.sleep,
      this.nav,
      this.fx
    )
    
    this.pet = new Petting({
      scene: this,
      bunny: this.bunny,
      settings: this.settings,
      speaker: this.speaker,
      interaction: this.interaction,
      carrots: this.carrots,
      nav: this.nav
    })

    const attention = new Attention(this, this.bunny, this.settings, this.speaker, this.interaction)
    this.brain = new Brain({
      scene: this,
      bunny: this.bunny,
      stage: this.stage,
      settings: this.settings,
      speaker: this.speaker,
      interaction: this.interaction,
      boxes: this.boxes,
      carrots: this.carrots,
      nav: this.nav,
      sleep: this.sleep,
      attention,
      ball: this.ball,
      pet: this.pet
    })

    // קופסאות -> ניווט וגזרים
    this.boxes.events = {
      added: box => {
        this.nav.clearRoute()
        if (!this.bunny.sleeping && this.bunny.body.bottom - box.top <= this.bunny.maxClimbRise()) {
          this.nav.setGoal(box, this.time.now)
        }
      },
      removed: box => {
        this.nav.clearRoute()
        this.nav.clearGoalIf(box)
      },
      edited: box => {
        this.nav.clearRoute()
        this.carrots.rescueAllFromBox(box)
        this.ball.rescueFromBox(box)
      }
    }

    this.resetPosition()

    this.bunny.sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.menu.show(pointer.x, pointer.y, this.mainMenuActions())
        this.speaker.say('menu', true)
        return
      }
      if (pointer.leftButtonDown()) this.drag.start(pointer)
    })

    this.input.on('pointermove', () => {
      this.interaction.pointerSeen = true
    })
    this.input.on('pointerdown', () => this.interaction.mark())
    const release = (): void => {
      this.drag.end()
      this.carrots.endDrag()
      this.ball.endDrag()
    }
    this.input.on('pointerup', release)
    this.input.on('pointerupoutside', release)
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], _dx: number, dy: number) =>
        this.boxes.scaleUnder(over, dy)
    )
    this.game.events.on(Phaser.Core.Events.BLUR, this.onGameBlur)
    window.addEventListener('resize', this.onWindowResize)

    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.refreshFloor() })
    this.time.delayedCall(700, () => this.speaker.say('greeting', true, greetingPhrases()))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.settingsPanel?.destroy()
      this.settingsPanel = undefined
      this.menu.destroy()
      this.game.events.off(Phaser.Core.Events.BLUR, this.onGameBlur)
      this.creditsPanel?.destroy()
      this.creditsPanel = undefined
      window.removeEventListener('resize', this.onWindowResize)
      window.removeEventListener('keydown', this.onKeyDown)
    })
    window.addEventListener('keydown', this.onKeyDown)
  }

  update(_time: number, delta: number): void {
    const now = this.time.now
    const dt = Math.min(delta, 50) / 1000

    this.carrots.updateHeld(delta)
    this.carrots.expire(now)
    this.ball.updateHeld(delta)
    this.ball.update(now, delta)
    this.pet.update(now, delta)

    switch (this.bunny.state) {
      case 'dragging':
        this.drag.update(delta)
        break
      case 'fear':
        this.holdInFear()
        this.fx.trackLanding()
        break
      default:
        this.brain.updateFree(now, dt)
        this.fx.trackLanding()
    }

    this.fx.updateTilt(delta, this.drag.throwVelocity.x)
    this.fx.updateDizzy()
    this.bunny.rememberVelocity()
  }

  /* ---------------- תפריט / הגדרות / איפוס ---------------- */

  private mainMenuActions(): MenuAction[] {
    const actions: MenuAction[] = [
      { label: 'הבא לכאן (איפוס מיקום)', onSelect: () => this.resetPosition() },
      { label: 'תגידי משהו', onSelect: () => this.speaker.say('random', true) },
      { label: 'קרדיטים 📜', onSelect: () => this.creditsPanel?.show() },
      { label: 'הוסף קופסה 📦', onSelect: () => this.boxes.add() },
      { label: 'הוסף גזר 🥕', onSelect: () => this.carrots.addFromMenu() },
      { label: this.ball.exists ? 'הסר כדור' : 'הוסף כדור ⚽', onSelect: () => this.ball.toggle() },
      { label: 'הגדרות ⚙️', onSelect: () => this.settingsPanel?.show() }
    ]
    if (this.boxes.list.length > 0) {
      actions.push({ label: 'הסר את כל הקופסאות', onSelect: () => this.boxes.removeAll() })
    }
    actions.push({
      label: 'סגור דובשנית',
      danger: true,
      onHover: () => {
        if (this.bunny.fearing) return

        this.sleep.wake('threat') // אם ישנה: מתעוררת בשקט, ואז מפחדת
        this.bunny.fearing = true
        this.holdInFear()
        this.speaker.say('shutdownFear', true)
      },
      onLeave: () => {
        this.bunny.fearing = false
      },
      onSelect: () => {
        this.bunny.fearing = false
        closeApp()
      }
    })
    return actions
  }

  /** פחד: מבטלת כל יעד ותנועה אופקית. הרעד עצמו מצויר ב-BunnyFx לפי `bunny.fearing`. */
  private holdInFear(): void {
    this.nav.clearGoal()
    this.nav.clearRoute()
    this.bunny.endLeap()
    this.bunny.body.setVelocityX(0)
  }

  private applySettings(): void {
    if (!this.bunny) return
    const settings = this.settings.get()
    this.bunny.body.setDragX(this.bunny.leaping ? 0 : DRAG_X)
    const maxUsefulSpeed = Math.max(settings.chaseSpeed, MAX_FLEE_SPEED)
    this.bunny.body.velocity.x = Phaser.Math.Clamp(this.bunny.body.velocity.x, -maxUsefulSpeed, maxUsefulSpeed)
    this.nav.clearRoute()
  }

  private resetPosition(): void {
    this.tweens.killTweensOf(this.bunny.sprite)
    this.nav.clearGoal()
    this.nav.clearRoute()
    this.fx.reset()
    this.bunny.resetPose()
    this.interaction.lastInteraction = this.time.now
  }
}

/* ============================================================
 *  הפעלה
 * ============================================================ */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'app',
  transparent: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false
    }
  },
  scene: DovshanitScene
}

new Phaser.Game(config)
