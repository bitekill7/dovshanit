import Phaser from 'phaser'
import type { Bunny, Stage } from './Bunny'
import { MOOD_SHIFT, type Category } from './phrases'
import type { Speaker } from './Speaker'

/* ============================================================
 *  מצב רוח: מספר אחד (0..100) שעולה מדברים טובים ויורד מדברים רעים,
 *  וחוזר לאט לבסיס. הרמה הנוכחית משפיעה על התנהגות (בריחה, מהירות, ליטוף)
 *  ועל מה שרואים: הילה, אימוג'ים מעל הראש ומד קצר שמופיע ונעלם לאט.
 * ============================================================ */

export type MoodLevel = 'angry' | 'upset' | 'neutral' | 'happy' | 'joyful'
const LEVELS: readonly MoodLevel[] = ['angry', 'upset', 'neutral', 'happy', 'joyful']

const START = 60
const BASELINE = 55
const RECOVER_PER_SEC = 0.25 // מתחת לבסיס: הכעס/העצב נשארים זמן ארוך
const DECAY_PER_SEC = 0.5 // מעל הבסיס: השמחה דועכת מהר יותר
const PET_GAIN_PER_SEC = 4
const MIN_VISIBLE_CHANGE = 2 // שינוי קטן מזה לא מקפיץ את המד
const GAUGE_HOLD_MS = 3200
const SHIFT_SPEECH_GAP_MS = 12000

function levelOf(value: number): MoodLevel {
  if (value < 20) return 'angry'
  if (value < 40) return 'upset'
  if (value < 65) return 'neutral'
  if (value < 85) return 'happy'
  return 'joyful'
}

/** השפעת כל אירוע (לפי קטגוריית הדיבור שלו) על מצב הרוח. ליטוף מתמשך מחושב בנפרד ב-update. */
const EVENT_EFFECT: Partial<Record<Category, number>> = {
  // רעים
  grab: -3,
  poke: -2,
  annoyed: -5,
  shake: -8,
  thrown: -2,
  wallHit: -2,
  landing: -2,
  taunt: -1.5, // רודפים אחריה עם הסמן
  cornered: -3,
  boxOnHead: -4,
  boxRemoved: -2,
  boxShrinks: -1,
  ballRemoved: -2,
  ballBored: -1,
  carrotTooHigh: -1, // מקניטים אותה עם גזר גבוה מדי
  beg: -1.5, // רעבה
  wakeStartled: -4,
  attention: -2, // צריכה להתחנן לתשומת לב
  attentionFlip: -2,
  attentionDance: -2,
  shutdownFear: -4,
  // טובים
  eat: 5,
  thanks: 7,
  thanksHand: 9,
  stuffed: 3,
  carrotSpotted: 3,
  carrotAdded: 4,
  carrotOffered: 1,
  carrotGift: 6,
  boxAdded: 2,
  boxClimb: 1,
  boxCarried: 1,
  boxGrows: 1,
  ballAdded: 4,
  ballKick: 1,
  ballHeader: 2,
  ballOffered: 2,
  petStart: 5,
  petEnd: 2,
  noticed: 5,
  wakeRested: 4,
  wakeCarrot: 1
}

/** במצב רע קשה לפייס אותה; במצב מעולה קשה לקלקל לה. */
const GAIN_SCALE: Record<MoodLevel, number> = { angry: 0.6, upset: 0.85, neutral: 1, happy: 1, joyful: 1 }
const LOSS_SCALE: Record<MoodLevel, number> = { angry: 1, upset: 1, neutral: 1, happy: 0.85, joyful: 0.7 }

type Rgb = [number, number, number]

interface Profile {
  flee: number // מכפיל רדיוס הבריחה מהסמן
  walk: number // מכפיל מהירות שיטוט
  face: string
  aura?: { rgb: Rgb; alpha: number; pulse: number }
  sign?: { emoji: string[]; everyMs: number }
}

const PROFILES: Record<MoodLevel, Profile> = {
  angry: {
    flee: 1.5,
    walk: 1.15,
    face: '😡',
    aura: { rgb: [255, 77, 77], alpha: 0.22, pulse: 0.012 },
    sign: { emoji: ['💢'], everyMs: 2600 }
  },
  upset: {
    flee: 1.25,
    walk: 0.7,
    face: '😢',
    aura: { rgb: [111, 143, 216], alpha: 0.16, pulse: 0.003 },
    sign: { emoji: ['💧', '😞'], everyMs: 4200 }
  },
  neutral: { flee: 1, walk: 1, face: '😐' },
  happy: {
    flee: 0.7,
    walk: 1.1,
    face: '😊',
    aura: { rgb: [255, 213, 74], alpha: 0.1, pulse: 0.003 },
    sign: { emoji: ['🎵'], everyMs: 7000 }
  },
  joyful: {
    flee: 0.45,
    walk: 1.25,
    face: '🥰',
    aura: { rgb: [255, 213, 74], alpha: 0.2, pulse: 0.005 },
    sign: { emoji: ['✨', '🎶'], everyMs: 3800 }
  }
}

/** איזה משפט אומרים במעבר בין רמות (undefined = מעבר שקט). */
function shiftKey(prev: MoodLevel, next: MoodLevel): keyof typeof MOOD_SHIFT | undefined {
  const rising = LEVELS.indexOf(next) > LEVELS.indexOf(prev)
  switch (next) {
    case 'angry':
      return 'angry'
    case 'upset':
      return rising ? undefined : 'upset'
    case 'neutral':
      return rising ? 'recovered' : undefined
    case 'happy':
      return rising ? 'happy' : undefined
    case 'joyful':
      return 'joyful'
  }
}

export class Feelings {
  private readonly scene: Phaser.Scene
  private readonly bunny: Bunny
  private readonly stage: Stage
  private readonly speaker: Speaker

  private readonly aura: Phaser.GameObjects.Ellipse
  private readonly gauge: Phaser.GameObjects.Graphics
  private readonly face: Phaser.GameObjects.Text

  private value = START
  private level: MoodLevel = levelOf(START)
  private auraRgb: Rgb = [255, 213, 74]
  private auraAlpha = 0
  private gaugeAlpha = 0
  private gaugeValue = START
  private gaugeUntil = 0
  private nextSignAt = 0
  private lastShiftSpeechAt = -Infinity

  constructor(scene: Phaser.Scene, bunny: Bunny, stage: Stage, speaker: Speaker) {
    this.scene = scene
    this.bunny = bunny
    this.stage = stage
    this.speaker = speaker

    const sprite = bunny.sprite
    this.aura = scene.add
      .ellipse(0, 0, sprite.displayWidth * 1.5, sprite.displayHeight * 1.2, 0xffffff, 0)
      .setDepth(19)
      .setVisible(false)
    this.gauge = scene.add.graphics().setDepth(103).setVisible(false)
    this.face = scene.add
      .text(0, 0, PROFILES[this.level].face, { fontFamily: 'sans-serif', fontSize: '16px' })
      .setOrigin(0.5)
      .setDepth(103)
      .setVisible(false)
  }

  /* ---------------- שאילתות להתנהגות ---------------- */

  /** מכפיל רדיוס הבריחה מהסמן: שמחה סומכת על הסמן, כועסת/עצובה מתרחקת. */
  fleeScale(): number {
    return PROFILES[this.level].flee
  }

  /** מכפיל מהירות השיטוט. */
  walkScale(): number {
    return PROFILES[this.level].walk
  }

  /** כועסת: לא מרשה ללטף אותה עד שתירגע. */
  allowsPetting(): boolean {
    return this.level !== 'angry'
  }

  /* ---------------- אירועים ---------------- */

  /** נקרא מ-Speaker בכל פעם שקטגוריית דיבור "קורית" (גם כשהדיבור כבוי). */
  react(category: Category): void {
    const effect = EVENT_EFFECT[category]
    if (!effect) return
    this.apply(effect)
    if (Math.abs(effect) >= MIN_VISIBLE_CHANGE) this.reveal()
  }

  private apply(amount: number): void {
    const scale = amount > 0 ? GAIN_SCALE[this.level] : LOSS_SCALE[this.level]
    this.value = Phaser.Math.Clamp(this.value + amount * scale, 0, 100)
    this.syncLevel()
  }

  private syncLevel(): void {
    const next = levelOf(this.value)
    if (next === this.level) return
    const prev = this.level
    this.level = next
    this.face.setText(PROFILES[next].face)
    this.reveal()
    this.announceShift(prev, next)
  }

  private announceShift(prev: MoodLevel, next: MoodLevel): void {
    const key = shiftKey(prev, next)
    if (!key) return
    // מדברת קצת אחרי האירוע שגרם לשינוי, כדי שהבועות לא יתערבבו
    this.scene.time.delayedCall(1100, () => {
      const now = this.scene.time.now
      const bunny = this.bunny
      if (this.level !== next || now - this.lastShiftSpeechAt < SHIFT_SPEECH_GAP_MS) return
      if (bunny.sleeping || bunny.dragging || bunny.fearing) return
      this.lastShiftSpeechAt = now
      this.speaker.say('moodShift', true, MOOD_SHIFT[key])
    })
  }

  private reveal(): void {
    this.gaugeUntil = this.scene.time.now + GAUGE_HOLD_MS
  }

  /* ---------------- כל פריים ---------------- */

  update(now: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000

    if (now < this.bunny.pettedUntil) {
      this.apply(PET_GAIN_PER_SEC * dt)
      this.reveal()
    }

    const diff = BASELINE - this.value
    const step = (diff > 0 ? RECOVER_PER_SEC : DECAY_PER_SEC) * dt
    this.value += Math.sign(diff) * Math.min(Math.abs(diff), step)
    this.syncLevel()

    this.updateAura(now, delta)
    this.emitSign(now)
    this.updateGauge(now, delta)
  }

  /** הילה צבעונית מאחורי הדמות; מתחלפת בהדרגה בין הרמות. */
  private updateAura(now: number, delta: number): void {
    const profile = PROFILES[this.level].aura
    const k = 1 - Math.exp(-delta / 500)
    if (profile) {
      for (let i = 0; i < 3; i++) this.auraRgb[i] += (profile.rgb[i] - this.auraRgb[i]) * k
    }
    this.auraAlpha += ((profile?.alpha ?? 0) - this.auraAlpha) * k

    if (this.auraAlpha < 0.005) {
      this.aura.setVisible(false)
      return
    }
    const sprite = this.bunny.sprite
    const pulse = 1 + 0.25 * Math.sin(now * (profile?.pulse ?? 0.003))
    const [r, g, b] = this.auraRgb
    this.aura
      .setPosition(sprite.x, sprite.y - sprite.displayHeight / 2)
      .setFillStyle(Phaser.Display.Color.GetColor(Math.round(r), Math.round(g), Math.round(b)), this.auraAlpha * pulse)
      .setVisible(true)
  }

  /** אימוג'י קטן שעולה מעל הראש מדי פעם, לפי הרמה. */
  private emitSign(now: number): void {
    const sign = PROFILES[this.level].sign
    const bunny = this.bunny
    if (!sign || now < this.nextSignAt || bunny.sleeping || bunny.dragging || now < bunny.pettedUntil) return
    this.nextSignAt = now + sign.everyMs * Phaser.Math.FloatBetween(0.8, 1.2)

    const sprite = bunny.sprite
    const x = sprite.x + Phaser.Math.Between(-24, 24)
    const y = sprite.y - sprite.displayHeight - 4
    const icon = this.scene.add
      .text(x, y, Phaser.Utils.Array.GetRandom(sign.emoji), { fontFamily: 'sans-serif', fontSize: '22px' })
      .setOrigin(0.5)
      .setDepth(102)
    this.scene.tweens.add({
      targets: icon,
      y: y - 45,
      alpha: 0,
      duration: 1400,
      ease: 'Sine.easeOut',
      onComplete: () => icon.destroy()
    })
  }

  /** המד מופיע לאט כשמצב הרוח זז, נשאר רגע, ונעלם לאט. */
  private updateGauge(now: number, delta: number): void {
    const wanted = now < this.gaugeUntil ? 1 : 0
    const tau = wanted > this.gaugeAlpha ? 400 : 800
    this.gaugeAlpha += (wanted - this.gaugeAlpha) * (1 - Math.exp(-delta / tau))

    if (wanted === 0 && this.gaugeAlpha < 0.02) {
      this.gaugeAlpha = 0
      this.gauge.setVisible(false)
      this.face.setVisible(false)
      return
    }

    this.gaugeValue += (this.value - this.gaugeValue) * (1 - Math.exp(-delta / 250))

    const sprite = this.bunny.sprite
    const width = 70
    const cx = Phaser.Math.Clamp(sprite.x, 70, this.stage.width - 70)
    const cy = Math.max(sprite.y - sprite.displayHeight - 108, 24)
    const left = cx - 26
    const rgb = Phaser.Display.Color.HSVToRGB((this.gaugeValue / 100) * 0.33, 0.85, 0.95) as Phaser.Types.Display.ColorObject
    const fill = Phaser.Display.Color.GetColor(rgb.r, rgb.g, rgb.b)

    this.gauge
      .clear()
      .fillStyle(0x000000, 0.6)
      .fillRoundedRect(left - 2, cy - 6, width + 4, 12, 6)
      .fillStyle(fill, 1)
      .fillRoundedRect(left, cy - 4, Math.max(4, (width * this.gaugeValue) / 100), 8, 4)
      .setVisible(true)
      .setAlpha(this.gaugeAlpha)
    this.face.setPosition(left - 20, cy).setVisible(true).setAlpha(this.gaugeAlpha)
  }
}
