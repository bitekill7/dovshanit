export class CreditsPanel {
  private readonly backdrop = document.createElement('div')
  private readonly root = document.createElement('div')
  private readonly text = document.createElement('div')
  private readonly close = document.createElement('button')

  private readonly lines: readonly string[] = [
    'קרדיטים:',
    'כתיבת הקוד:',
    'עומר צור',
    'נועה בוטבול',
    'ציקי שתמיד ישן',
    'demama7',
    'biteKill7',
    'מה הקטע אם ה-7?',
    'טוב לא משנה הבא בתור...',
    '',
    'עיצוב:',
    'מתן הגבר רצח (זה אני כמובן)',
    'הילה מצור',
    '',
    'סאונד:',
    'גם הילה שהייתה ערה עד 1:00 בלילה בגללי (סליחה)',
    '',
    'השראה:',
    'יוסי ההומלס מפתח תקווה הוא בדרך כלל בצומת, כל תרומה תתקבל בשמחה',
    'כמו כן, למי שיש אקמול וקופסת קרטון בגודל סביר, זה יעזור לו מאוד. תודה.',
    'אבנר הגבר מהמכולת שאני חייב לו חמישה שקלים, אבל אני מקווה שהוא יסלח לי.',
    "פומלה קלופה",
    'וקערת חומוס אקראית',
    '',
    'וזהו באמת שאין עוד מה לומר...',
    'כאילו באמת למה אתם עדין פה?',
    'אתם סתם מבזבזים זמן מהחיים שלכם כי זה צפוי שיהיה קטע מצחיק בסוף אז תדעו משהו...',
    'לא יהיה שום דבר!',
    'אתם עדין פה אין כלום אני אומר לכם!',
    'טוב לא אכפת לי מכם תישארו פה אני הולך לקלף פומלה',
    'סתם! מי המשוגע שילך לקלף פומלה לבד זה סופר קשה וביזבוז של זמן ',
    'אתם יודעים מה עוד בזבוז של זמן?',
    'זה שאתם עדין פה!',
    '',
    'אמרתי לכם שאין שום דבר בסוף',
    '@#$%^&',
    'הקוד הסודי היה c135ISeeYou',
    'זהו זה, מקווים שתיהנו',
    'נו מה לא נכנעתם כבר?',
    'אז יודעים מה... ',
    'אני ניכנע!',
    'מכם!',
    'אבגדהוחטיכלמנסעפצקרשת',
    'איזה אות היתה חסרה?',
    'יפה אם הצלחת אז תדע שזה אתה!',
    'נו תילכו כבר או שאני מציג סוף חסר פואנט',
    'התאם בטוחים שאתם רוצים את זה',
    'אוקיי...',
    'כי לי אין בעיה בכלל...',
    'אז אינה זה...',
    'אני רק מזכיר שאתם רציתם את זה!',
    'בבקשה',
    '"סוף חסר פואנט"',
  ]

  private readonly FADE_IN_MS = 900
  private readonly HOLD_MS = 1200
  private readonly FADE_OUT_MS = 900
  private readonly BLANK_MS = 500

  private timer?: number
  private animationId?: number
  private runId = 0
  private visible = false

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.visible) {
      this.hide()
    }
  }

  constructor() {
    Object.assign(this.backdrop.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      background: '#000',
      zIndex: '3000',
      direction: 'rtl',
      boxSizing: 'border-box'
    })

    this.backdrop.dataset.dovshanitIgnore = 'true'

    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      background: '#000',
      color: '#fff',
      fontFamily: 'sans-serif',
      textAlign: 'center',
      direction: 'rtl',
      userSelect: 'none'
    })

    this.root.dataset.dovshanitIgnore = 'true'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', 'קרדיטים לדובשנית')

    Object.assign(this.text.style, {
      maxWidth: 'min(900px, 90vw)',
      maxHeight: '80vh',
      overflow: 'hidden',
      color: '#fff',
      fontSize: 'clamp(18px, 2.2vw, 30px)',
      fontWeight: '500',
      lineHeight: '1.5',
      textShadow: '0 0 10px rgba(255,255,255,0.18)',
      opacity: '0',
      transition: 'none'
    })

    Object.assign(this.close.style, {
      position: 'fixed',
      top: '18px',
      right: '18px',
      width: '38px',
      height: '38px',
      border: '1px solid rgba(255,255,255,0.35)',
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.65)',
      color: '#fff',
      fontSize: '20px',
      lineHeight: '1',
      cursor: 'pointer',
      zIndex: '1'
    })

    this.close.type = 'button'
    this.close.textContent = '✕'
    this.close.setAttribute('aria-label', 'סגור קרדיטים')
    this.close.addEventListener('click', () => this.hide())

    this.backdrop.addEventListener('click', event => {
      if (event.target === this.backdrop) this.hide()
    })

    this.root.append(this.text, this.close)
    this.backdrop.append(this.root)
    document.body.append(this.backdrop)
    document.addEventListener('keydown', this.onKeyDown)
  }

  show(): void {
    this.stopAnimation()
    this.visible = true
    this.backdrop.style.display = 'block'
    this.runId += 1
    void this.play(this.runId)
  }

  hide(): void {
    this.visible = false
    this.runId += 1
    this.stopAnimation()
    this.text.textContent = ''
    this.text.style.opacity = '0'
    this.backdrop.style.display = 'none'
  }

  destroy(): void {
    this.hide()
    document.removeEventListener('keydown', this.onKeyDown)
    this.backdrop.remove()
  }

  private async play(runId: number): Promise<void> {
    for (const line of this.lines) {
      if (!this.visible || runId !== this.runId) return

      if (!line) {
        await this.wait(this.BLANK_MS)
        continue
      }

      this.text.textContent = line
      this.text.style.opacity = '0'
      this.text.style.transition = `opacity ${this.FADE_IN_MS}ms ease-in-out`

      await this.nextFrame()
      if (!this.visible || runId !== this.runId) return

      this.text.style.opacity = '1'
      await this.wait(this.FADE_IN_MS)

      if (!this.visible || runId !== this.runId) return

      await this.wait(this.HOLD_MS)

      if (!this.visible || runId !== this.runId) return

      this.text.style.transition = `opacity ${this.FADE_OUT_MS}ms ease-in-out`
      this.text.style.opacity = '0'
      await this.wait(this.FADE_OUT_MS)
    }

    if (!this.visible || runId !== this.runId) return

    this.hide()
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.timer = window.setTimeout(resolve, ms)
    })
  }

  private nextFrame(): Promise<void> {
    return new Promise(resolve => {
      this.animationId = window.requestAnimationFrame(() => resolve())
    })
  }

  private stopAnimation(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer)
      this.timer = undefined
    }

    if (this.animationId !== undefined) {
      window.cancelAnimationFrame(this.animationId)
      this.animationId = undefined
    }
  }
}
