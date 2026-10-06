import Phaser from 'phaser'
import { GLOBAL_SPEECH_GAP_MS } from './constants'
import type { Bunny, Stage } from './Bunny'
import { SPEECH, type Category } from './phrases'
import type { SettingsStore } from './SettingsStore'

/* ============================================================
 *  דיבור: בחירת משפט, קירור לפי קטגוריה ובועת טקסט מעל הדמות
 * ============================================================ */
export class Speaker {
  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly stage: Stage
  private readonly settings: SettingsStore

  private lastAnySpeech = -Infinity
  private readonly lastSpeech: Partial<Record<Category, number>> = {}
  private readonly lastPhrase: Partial<Record<Category, string>> = {}

  constructor(scene: Phaser.Scene, bunny: Bunny, settings: SettingsStore, stage: Stage) {
    this.scene = scene
    this.bunny = bunny
    this.settings = settings
    this.stage = stage
  }

  say(category: Category, force = false, pool?: readonly string[]): void {
    if (!this.settings.get().speechEnabled) return
    const now = this.scene.time.now
    const rule = SPEECH[category]

    if (!force) {
      if (now - (this.lastSpeech[category] ?? -Infinity) < rule.cooldown) return
      if (!rule.urgent && now - this.lastAnySpeech < GLOBAL_SPEECH_GAP_MS) return
    }

    this.lastAnySpeech = now
    this.lastSpeech[category] = now
    this.showBubble(this.pickPhrase(category, pool ?? rule.phrases))
  }

  private pickPhrase(category: Category, source: readonly string[]): string {
    const all = [...source]
    const previous = this.lastPhrase[category]
    const options = all.length > 1 ? all.filter(p => p !== previous) : all
    const chosen = Phaser.Utils.Array.GetRandom(options)
    this.lastPhrase[category] = chosen
    return chosen
  }

  private showBubble(message: string): void {
    const sprite = this.bunny.sprite
    const t = this.scene.add
      .text(0, 0, message, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        rtl: true
      })
      .setOrigin(0.5)
      .setDepth(100)

    const margin = 8
    const rise = 70
    const x = Phaser.Math.Clamp(sprite.x, t.width / 2 + margin, this.stage.width - t.width / 2 - margin)
    const y = Math.max(sprite.y - sprite.displayHeight - 14, t.height / 2 + margin + rise)
    t.setPosition(x, y)

    this.scene.tweens.add({
      targets: t,
      y: t.y - rise,
      alpha: 0,
      angle: Phaser.Math.Between(-20, 20),
      duration: 1500,
      ease: 'Power2',
      onComplete: () => t.destroy()
    })
  }
}
