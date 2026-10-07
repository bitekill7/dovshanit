import Phaser from 'phaser'
import type { Bunny, Stage } from './Bunny'
import type { Feelings } from './Feelings'
import type { Interaction } from './Moods'
import { writeNoteFile } from './platform'
import type { SettingsStore } from './SettingsStore'
import type { Speaker } from './Speaker'

/* ============================================================
 *  נכסים: שני הקבצים האלה צריכים לשבת בתיקיית ../assets/
 *    jumpscare1.(png|jpg|jpeg|webp|gif)  – תמונת ההפחדה
 *    scream1.(mp3|wav|ogg)               – סאונד ההפחדה
 *  אם קובץ חסר, הוא פשוט מדולג והשאר ממשיך לעבוד (ללא שגיאת build).
 * ============================================================ */
let jumpscareUrl: string | undefined
let screamUrl: string | undefined
try {
  // @ts-ignore import.meta.glob מגיע מ-Vite; ה-ignore מכסה פרויקט שלא כולל את טיפוסי vite/client
  jumpscareUrl = Object.values(import.meta.glob('../assets/jumpscare1.{png,jpg,jpeg,webp,gif}', { eager: true, import: 'default' }) as Record<string, string>)[0]
} catch {
  jumpscareUrl = undefined
}
try {
  // @ts-ignore ראו הערה למעלה
  screamUrl = Object.values(import.meta.glob('../assets/scream1.{mp3,wav,ogg}', { eager: true, import: 'default' }) as Record<string, string>)[0]
} catch {
  screamUrl = undefined
}

const FIRST_EVENT_DELAY_MS: [number, number] = [3000, 6000]
const EVENT_EVERY_MS: [number, number] = [8000, 14000]
const JUMPSCARE_COOLDOWN_MS = 30000
const NOTE_COOLDOWN_MS = 90000
const MAX_NOTES_PER_SESSION = 3

interface Note {
  file: string
  text: string
}

/** פתקים מצחיקים-מפחידים בלבד. נכתבים (אם יש גשר Electron) לתיקייה ייעודית, אחרת מוצגים על המסך. */
const NOTES: readonly Note[] = [
  { file: 'i_see_you.txt', text: 'אני רואה אותך.\nאני תמיד רואה אותך.\n\n- דובשנית' },
  { file: 'dont_close_me.txt', text: 'אל תסגור אותי.\nאני יודעת איפה הכפתור "סגור דובשנית".\nואני אזכור.\n\n- דובשנית' },
  { file: 'behind_you.txt', text: 'תסתכל מאחוריך.\nסתם, אין שם כלום. אבל אני עדיין כועסת.\n\n- דובשנית' }
]

const CUTE_EMOJI = ['💖', '🌸', '⭐', '🎈', '💕']

export interface MonsterDeps {
  scene: Phaser.Scene
  bunny: Bunny
  stage: Stage
  settings: SettingsStore
  speaker: Speaker
  interaction: Interaction
  feelings: Feelings
}

/* ============================================================
 *  "מצב מפלצת" (כבוי כברירת מחדל, מתג בהגדרות):
 *  כועסת מאוד = הפחדות (סאונד, ג'אמפסקר, הבהוב אדום, פתקי איום).
 *  מאושרת מאוד = דברים חמודים (גשם לבבות, קפיצות שמחה, נשיקה לסמן).
 * ============================================================ */
export class MonsterMode {
  private readonly d: MonsterDeps
  private readonly scream?: HTMLAudioElement
  private nextAt = 0
  private lastJumpscareAt = -Infinity
  private lastNoteAt = -Infinity
  private notesLeft = 0

  constructor(deps: MonsterDeps) {
    this.d = deps
    if (screamUrl) {
      this.scream = new Audio(screamUrl)
      this.scream.volume = 0.8
    }
    if (jumpscareUrl) new Image().src = jumpscareUrl // טעינה מראש, כדי שההפחדה תופיע בלי השהיה
    else console.warn('MonsterMode: לא נמצאה תמונת jumpscare1 בתיקיית assets')
    if (!screamUrl) console.warn('MonsterMode: לא נמצא סאונד scream1 בתיקיית assets')
  }

  update(now: number): void {
    const { bunny, settings, feelings } = this.d
    if (!settings.get().monsterMode) {
      this.nextAt = 0
      return
    }
    const mood = feelings.mood
    if (mood !== 'angry' && mood !== 'joyful') {
      this.nextAt = 0
      return
    }
    if (bunny.sleeping || bunny.dragging) return

    if (this.nextAt === 0) {
      this.nextAt = now + Phaser.Math.Between(...FIRST_EVENT_DELAY_MS)
      return
    }
    if (now < this.nextAt) return
    this.nextAt = now + Phaser.Math.Between(...EVENT_EVERY_MS)

    if (mood === 'angry') this.scare(now)
    else this.cute()
  }

  /* ---------------- מפלצת ---------------- */

  private scare(now: number): void {
    const roll = Math.random()
    if (roll < 0.4) {
      this.d.speaker.say('monsterTaunt', true)
    } else if (roll < 0.65) {
      this.redFlash()
    } else if (roll < 0.95) {
      if (now - this.lastJumpscareAt >= JUMPSCARE_COOLDOWN_MS) this.jumpscare(now)
      else this.redFlash()
    } else if (this.canLeaveNote(now)) {
      void this.leaveNote(now)
    } else {
      this.d.speaker.say('monsterTaunt', true)
    }
  }

  private playScream(): void {
    const audio = this.scream
    if (!audio) return
    audio.currentTime = 0
    void audio.play().catch(() => {}) // חסימת autoplay או קובץ פגום: ממשיכים בלי סאונד
  }

  /** שכבת מסך מלא שלא חוסמת את העכבר, ונמחקת בסוף האנימציה. */
  private overlay(background: string): HTMLDivElement {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background,
      pointerEvents: 'none',
      zIndex: '3500',
      opacity: '0'
    })
    document.body.append(el)
    return el
  }

  private redFlash(): void {
    this.d.scene.cameras.main.shake(450, 0.015)
    const el = this.overlay('radial-gradient(circle, rgba(0,0,0,0) 30%, rgba(170,0,0,0.65) 100%)')
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.15 }, { opacity: 0.9 }, { opacity: 0 }], { duration: 1400 })
    anim.onfinish = () => el.remove()
  }

  private jumpscare(now: number): void {
    this.lastJumpscareAt = now
    this.playScream()
    this.d.scene.cameras.main.shake(700, 0.03)

    const el = this.overlay(jumpscareUrl ? '#000' : 'rgba(120,0,0,0.7)')
    if (jumpscareUrl) {
      const img = document.createElement('img')
      img.src = jumpscareUrl
      Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' })
      el.append(img)
    }
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scale(0.7)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.1 },
        { opacity: 1, transform: 'scale(1.06)', offset: 0.7 },
        { opacity: 0, transform: 'scale(1.15)' }
      ],
      { duration: 1100 }
    )
    anim.onfinish = () => el.remove()
  }

  private canLeaveNote(now: number): boolean {
    return this.notesLeft < MAX_NOTES_PER_SESSION && now - this.lastNoteAt >= NOTE_COOLDOWN_MS
  }

  private async leaveNote(now: number): Promise<void> {
    const note = NOTES[this.notesLeft % NOTES.length]
    this.notesLeft++
    this.lastNoteAt = now

    const written = await writeNoteFile(note.file, note.text)
    if (written) {
      this.d.speaker.say('monsterTaunt', true, ['השארתי לך פתק בתיקיית "דובשנית" על שולחן העבודה...'])
    } else {
      this.showNote(note) // אין גשר Electron לכתיבת קבצים: מציגה את הפתק על המסך
    }
  }

  private showNote(note: Note): void {
    const win = document.createElement('div')
    Object.assign(win.style, {
      position: 'fixed',
      left: `${Phaser.Math.Between(20, Math.max(21, window.innerWidth - 300))}px`,
      top: `${Phaser.Math.Between(20, Math.max(21, window.innerHeight - 240))}px`,
      width: '260px',
      background: '#f3ecc8',
      color: '#2b0000',
      border: '2px solid #3a0000',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      fontFamily: 'monospace',
      direction: 'rtl',
      zIndex: '3400'
    })
    win.dataset.dovshanitIgnore = 'true'

    const bar = document.createElement('div')
    Object.assign(bar.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 8px',
      background: '#3a0000',
      color: '#fff',
      fontSize: '12px'
    })
    const title = document.createElement('span')
    title.textContent = note.file
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = '✕'
    Object.assign(close.style, { border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer' })
    close.addEventListener('click', () => win.remove())
    bar.append(title, close)

    const body = document.createElement('div')
    body.textContent = note.text
    Object.assign(body.style, { whiteSpace: 'pre-wrap', padding: '12px', fontSize: '14px', lineHeight: '1.5' })

    win.append(bar, body)
    document.body.append(win)
    window.setTimeout(() => win.remove(), 9000)
  }

  /* ---------------- חמודה ---------------- */

  private cute(): void {
    const roll = Math.random()
    if (roll < 0.4) this.heartRain()
    else if (roll < 0.75) this.happyHops()
    else this.blowKiss()
  }

  private heartRain(): void {
    const { scene, stage, speaker } = this.d
    speaker.say('cuteAct', true)
    for (let i = 0; i < 14; i++) {
      scene.time.delayedCall(i * 120, () => {
        const x = Phaser.Math.Between(20, Math.max(21, stage.width - 20))
        const icon = scene.add
          .text(x, -20, Phaser.Utils.Array.GetRandom(CUTE_EMOJI), {
            fontFamily: 'sans-serif',
            fontSize: `${Phaser.Math.Between(18, 30)}px`
          })
          .setOrigin(0.5)
          .setDepth(102)
        scene.tweens.add({
          targets: icon,
          x: x + Phaser.Math.Between(-40, 40),
          y: stage.floorY - Phaser.Math.Between(0, 30),
          alpha: 0,
          duration: Phaser.Math.Between(2200, 3200),
          ease: 'Sine.easeIn',
          onComplete: () => icon.destroy()
        })
      })
    }
  }

  private happyHops(): void {
    const { scene, bunny, speaker } = this.d
    speaker.say('cuteAct', true)
    for (let i = 0; i < 3; i++) {
      scene.time.delayedCall(i * 450, () => {
        if (!bunny.isGrounded() || bunny.dragging || bunny.sleeping) return
        bunny.body.setVelocityY(bunny.jumpVelocity(0.62, 300))
        this.floatEmoji('✨', bunny.sprite.x + Phaser.Math.Between(-20, 20), bunny.sprite.y - bunny.sprite.displayHeight)
      })
    }
  }

  /** לב שעף מהדמות אל הסמן ומתפוצץ שם. אם הסמן עוד לא נראה בחלון: גשם לבבות במקום. */
  private blowKiss(): void {
    const { scene, bunny, speaker, interaction } = this.d
    if (!interaction.pointerSeen) {
      this.heartRain()
      return
    }
    const pointer = scene.input.activePointer
    const sprite = bunny.sprite
    const tx = pointer.x
    const ty = pointer.y
    speaker.say('cuteAct', true)
    sprite.flipX = tx < sprite.x

    const heart = scene.add
      .text(sprite.x, sprite.y - sprite.displayHeight, '💗', { fontFamily: 'sans-serif', fontSize: '24px' })
      .setOrigin(0.5)
      .setDepth(102)
    scene.tweens.add({
      targets: heart,
      x: tx,
      y: ty,
      scale: 1.8,
      duration: 900,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        for (let i = 0; i < 3; i++) this.floatEmoji('💖', tx + Phaser.Math.Between(-20, 20), ty)
        heart.destroy()
      }
    })
  }

  private floatEmoji(emoji: string, x: number, y: number): void {
    const { scene } = this.d
    const icon = scene.add.text(x, y, emoji, { fontFamily: 'sans-serif', fontSize: '22px' }).setOrigin(0.5).setDepth(102)
    scene.tweens.add({
      targets: icon,
      y: y - 50,
      alpha: 0,
      duration: 1200,
      ease: 'Sine.easeOut',
      onComplete: () => icon.destroy()
    })
  }
}
