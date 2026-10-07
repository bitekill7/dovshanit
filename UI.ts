import Phaser from 'phaser'
import { RANGE_LIMITS, type RangeSettingKey, type SettingsKey, type SettingsStore, type ToggleSettingKey } from './SettingsStore'

/* תפריט הקשר (DOM) עם פעולות דינמיות */
export interface MenuAction {
  label: string
  danger?: boolean
  onSelect: () => void
  onHover?: () => void
  onLeave?: () => void
}

export class ContextMenu {
  private readonly root = document.createElement('div')
  private hoveredLeave?: () => void
  private readonly onDocClick = (): void => this.hide()
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.hide()
  }
  private readonly onContextMenu = (e: Event): void => e.preventDefault()

  constructor() {
    Object.assign(this.root.style, {
      position: 'fixed',
      display: 'none',
      backgroundColor: '#1e1e1e',
      color: '#fff',
      border: '1px solid #333',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      padding: '5px 0',
      zIndex: '1000',
      fontFamily: 'sans-serif',
      minWidth: '170px',
      direction: 'rtl',
      textAlign: 'right',
      userSelect: 'none'
    })
    this.root.setAttribute('role', 'menu')
    this.root.dataset.dovshanitIgnore = 'true'
    document.body.appendChild(this.root)

    document.addEventListener('click', this.onDocClick)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('blur', this.onDocClick)
  }

  show(x: number, y: number, actions: MenuAction[]): void {
    this.root.replaceChildren()
    for (const action of actions) this.root.appendChild(this.buildItem(action))

    this.root.style.display = 'block'
    const w = this.root.offsetWidth
    const h = this.root.offsetHeight
    this.root.style.left = `${Phaser.Math.Clamp(x, 4, Math.max(4, window.innerWidth - w - 4))}px`
    this.root.style.top = `${Phaser.Math.Clamp(y, 4, Math.max(4, window.innerHeight - h - 4))}px`
  }

  showCentered(actions: MenuAction[]): void {
    this.show(0, 0, actions)
  
    const w = this.root.offsetWidth
    const h = this.root.offsetHeight
  
    const x = Math.max(4, (window.innerWidth - w) / 2)
    const y = Math.max(4, (window.innerHeight - h) / 2)
  
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
  }

  hide(): void {
    this.hoveredLeave?.()
    this.hoveredLeave = undefined
    this.root.style.display = 'none'
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none'
  }

  destroy(): void {
    document.removeEventListener('click', this.onDocClick)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('blur', this.onDocClick)
    this.root.remove()
  }

  private buildItem(action: MenuAction): HTMLElement {
    const item = document.createElement('div')
    item.textContent = action.label
    item.setAttribute('role', 'menuitem')
    Object.assign(item.style, {
      padding: '8px 15px',
      cursor: 'pointer',
      color: action.danger ? '#ff6b6b' : '#fff'
    })
    item.addEventListener('mouseenter', () => {
      this.hoveredLeave?.()
      this.hoveredLeave = action.onLeave
      action.onHover?.()
      item.style.backgroundColor = '#333'
    })
    item.addEventListener('mouseleave', () => {
      action.onLeave?.()
      if (this.hoveredLeave === action.onLeave) this.hoveredLeave = undefined
      item.style.backgroundColor = 'transparent'
    })
    item.addEventListener('click', () => {
      this.hide()
      action.onSelect()
    })
    return item
  }
}

/* ============================================================
 *  חלון הגדרות (DOM) – נבנה מתוך הגדרות הסליידרים והמתגים
 * ============================================================ */

const PERCENT_KEYS: ReadonlySet<SettingsKey> = new Set<SettingsKey>(['globalEventChance'])

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`
const formatSpeed = (value: number): string => `${Math.round(value)} px/s`
const formatPixels = (value: number): string => `${Math.round(value)} px`

export class SettingsPanel {
  private readonly backdrop = document.createElement('div')
  private readonly root = document.createElement('div')
  private readonly body = document.createElement('div')
  private readonly store: SettingsStore
  private readonly onChange: () => void
  private readonly inputMap = new Map<SettingsKey, HTMLInputElement>()
  private readonly valueMap = new Map<SettingsKey, HTMLElement>()
  private readonly formatMap = new Map<SettingsKey, (value: number) => string>()
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.root.style.display !== 'none') this.hide()
  }

  constructor(store: SettingsStore, onChange: () => void) {
    this.store = store
    this.onChange = onChange

    Object.assign(this.backdrop.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      background: 'rgba(0,0,0,0.28)',
      zIndex: '1999'
    })
    this.backdrop.dataset.dovshanitIgnore = 'true'
    this.backdrop.addEventListener('click', () => this.hide())

    Object.assign(this.root.style, {
      position: 'fixed',
      display: 'none',
      inset: '50% auto auto 50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(430px, calc(100vw - 24px))',
      maxHeight: 'min(720px, calc(100vh - 24px))',
      overflow: 'auto',
      padding: '16px',
      borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.14)',
      background: 'rgba(24,24,28,0.97)',
      color: '#fff',
      boxShadow: '0 16px 45px rgba(0,0,0,0.55)',
      zIndex: '2000',
      fontFamily: 'sans-serif',
      direction: 'rtl',
      boxSizing: 'border-box'
    })
    this.root.dataset.dovshanitIgnore = 'true'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', 'הגדרות דובשנית')

    const title = document.createElement('div')
    Object.assign(title.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      marginBottom: '14px'
    })

    const heading = document.createElement('h2')
    heading.textContent = '⚙️ הגדרות דובשנית'
    Object.assign(heading.style, { margin: '0', fontSize: '20px' })

    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = '✕'
    close.setAttribute('aria-label', 'סגור הגדרות')
    this.styleButton(close, true)
    close.addEventListener('click', () => this.hide())

    title.append(heading, close)
    this.root.append(title, this.body)
    document.body.append(this.backdrop, this.root)
    document.addEventListener('keydown', this.onKeyDown)
    this.build()
  }

  show(): void {
    this.sync()
    this.backdrop.style.display = 'block'
    this.root.style.display = 'block'
    const first = this.body.querySelector<HTMLInputElement>('input')
    first?.focus()
  }

  hide(): void {
    this.root.style.display = 'none'
    this.backdrop.style.display = 'none'
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown)
    this.backdrop.remove()
    this.root.remove()
  }

  private build(): void {
    this.body.replaceChildren()
    this.inputMap.clear()
    this.valueMap.clear()
    this.formatMap.clear()

    this.addRange('globalEventChance', 'סיכוי גלובלי לאירועים', formatPercent)
    this.addRange('walkSpeed', 'מהירות הליכה', formatSpeed)
    this.addRange('chaseSpeed', 'מהירות רדיפה אחרי גזר', formatSpeed)
    this.addRange('jumpHeight', 'גובה קפיצה', formatPixels)

    this.addToggle('speechEnabled', 'דיבור ובועות טקסט')
    this.addToggle('randomEventsEnabled', 'אירועים אקראיים')
    this.addToggle('attentionEnabled', 'משיכת תשומת לב כשמתעלמים ממנה')
    this.addToggle('hungerEnabled', 'רעב ובקשות לגזר')
    this.addToggle('smartParkourEnabled', 'פארקור חכם סביב מכשולים')
    this.addToggle('fleeMouseEnabled', 'בריחה מהסמן כשהוא מתקרב')
    this.addToggle('petEnabled', 'ליטוף עדין עם הסמן (היא נרגעת ונהנית)')

    this.addToggle('monsterMode', 'מצב מפלצת (מפחיד כשהיא כועסת, חמוד כשהיא מאושרת)')

    const actions = document.createElement('div')
    Object.assign(actions.style, { display: 'flex', gap: '8px', marginTop: '14px' })

    const reset = document.createElement('button')
    reset.type = 'button'
    reset.textContent = 'איפוס הגדרות'
    this.styleButton(reset)
    reset.addEventListener('click', () => {
      this.store.reset()
      this.sync()
      this.onChange()
    })

    const done = document.createElement('button')
    done.type = 'button'
    done.textContent = 'סיום'
    this.styleButton(done, true)
    done.addEventListener('click', () => this.hide())

    actions.append(reset, done)
    this.body.append(actions)
  }

  private addRange(key: RangeSettingKey, label: string, format: (value: number) => string): void {
    const limits = RANGE_LIMITS[key]
    const scale = PERCENT_KEYS.has(key) ? 100 : 1
    const min = Math.round(limits.min * scale)
    const max = Math.round(limits.max * scale)
    const step = Math.round(limits.step * scale)

    const row = document.createElement('label')
    Object.assign(row.style, {
      display: 'grid',
      gap: '6px',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      cursor: 'pointer'
    })

    const top = document.createElement('div')
    Object.assign(top.style, { display: 'flex', justifyContent: 'space-between', gap: '10px' })

    const text = document.createElement('span')
    text.textContent = label

    const value = document.createElement('output')
    Object.assign(value.style, { opacity: '0.8', fontVariantNumeric: 'tabular-nums' })

    top.append(text, value)

    const input = document.createElement('input')
    input.type = 'range'
    input.min = `${min}`
    input.max = `${max}`
    input.step = `${step}`

    input.addEventListener('input', () => {
      const numeric = Number(input.value)
      const normalized = PERCENT_KEYS.has(key) ? numeric / 100 : numeric
      this.store.set(key, normalized)
      value.textContent = format(this.store.get()[key])
      this.onChange()
    })

    row.append(top, input)
    this.body.append(row)
    this.inputMap.set(key, input)
    this.valueMap.set(key, value)
    this.formatMap.set(key, format)
  }

  private addToggle(key: ToggleSettingKey, label: string): void {
    const row = document.createElement('label')
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      cursor: 'pointer'
    })

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.addEventListener('change', () => {
      this.store.set(key, input.checked)
      this.onChange()
    })

    const text = document.createElement('span')
    text.textContent = label
    row.append(input, text)
    this.body.append(row)
    this.inputMap.set(key, input)
  }

  private sync(): void {
    const settings = this.store.get()
    ;(Object.keys(settings) as SettingsKey[]).forEach(key => {
      const input = this.inputMap.get(key)
      if (!input) return

      if (input.type === 'checkbox') {
        input.checked = settings[key] as boolean
        return
      }

      const current = settings[key] as number
      input.value = `${PERCENT_KEYS.has(key) ? current * 100 : current}`
      const output = this.valueMap.get(key)
      const format = this.formatMap.get(key)
      if (output && format) output.textContent = format(current)
    })
  }

  private styleButton(button: HTMLButtonElement, primary = false): void {
    Object.assign(button.style, {
      padding: '8px 12px',
      borderRadius: '9px',
      border: primary ? '1px solid #ffd54a' : '1px solid rgba(255,255,255,0.15)',
      background: primary ? '#3a3114' : '#2a2a30',
      color: '#fff',
      cursor: 'pointer',
      flex: '1'
    })
  }
}
