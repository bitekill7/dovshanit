import Phaser from 'phaser'
import { CHASE_SPEED, DEFAULT_JUMP_HEIGHT, MAX_JUMP_HEIGHT, MIN_JUMP_HEIGHT, WALK_SPEED } from './constants'

/* ============================================================
 *  הגדרות – טיפוסים, ברירות מחדל, ניקוי ושמירה מקומית
 * ============================================================ */

export interface DovshanitSettings {
  globalEventChance: number
  walkSpeed: number
  chaseSpeed: number
  jumpHeight: number
  speechEnabled: boolean
  randomEventsEnabled: boolean
  attentionEnabled: boolean
  hungerEnabled: boolean
  smartParkourEnabled: boolean
  fleeMouseEnabled: boolean
  petEnabled: boolean
}

export type SettingsKey = keyof DovshanitSettings

/** מפתחות שמוצגים בחלון ההגדרות כסליידר. */
export type RangeSettingKey = 'globalEventChance' | 'walkSpeed' | 'chaseSpeed' | 'jumpHeight'

/** מפתחות שמוצגים בחלון ההגדרות כמתג. */
export type ToggleSettingKey = Exclude<SettingsKey, RangeSettingKey>

export interface RangeLimits {
  min: number
  max: number
  step: number
}

/** מקור אמת יחיד לטווחי הסליידרים (משמש גם לניקוי ערכים וגם לממשק). globalEventChance נשמר כשבר 0..1. */
export const RANGE_LIMITS: Readonly<Record<RangeSettingKey, RangeLimits>> = {
  globalEventChance: { min: 0, max: 1, step: 0.05 },
  walkSpeed: { min: 50, max: 260, step: 5 },
  chaseSpeed: { min: 80, max: 360, step: 5 },
  jumpHeight: { min: MIN_JUMP_HEIGHT, max: MAX_JUMP_HEIGHT, step: 5 }
}

export const SETTINGS_STORAGE_KEY = 'dovshanit.settings.v1'

export const DEFAULT_SETTINGS: Readonly<DovshanitSettings> = {
  globalEventChance: 0.85,
  walkSpeed: WALK_SPEED,
  chaseSpeed: CHASE_SPEED,
  jumpHeight: DEFAULT_JUMP_HEIGHT,
  speechEnabled: true,
  randomEventsEnabled: true,
  attentionEnabled: true,
  hungerEnabled: true,
  smartParkourEnabled: true,
  fleeMouseEnabled: true,
  petEnabled: true
}

function clampSettingValue(key: SettingsKey, value: unknown): number | boolean {
  if (key in RANGE_LIMITS) {
    const { min, max } = RANGE_LIMITS[key as RangeSettingKey]
    const numeric = Number(value)
    // בודקים סופיות ולא "falsy", כדי ש-0 (למשל סיכוי 0%) יישמר ולא יוחלף בברירת מחדל
    return Phaser.Math.Clamp(Number.isFinite(numeric) ? numeric : DEFAULT_SETTINGS[key as RangeSettingKey], min, max)
  }
  return Boolean(value)
}

function sanitizeSettings(raw: Partial<DovshanitSettings> | null | undefined): DovshanitSettings {
  const source = raw ?? {}
  const result: DovshanitSettings = { ...DEFAULT_SETTINGS }
  ;(Object.keys(DEFAULT_SETTINGS) as SettingsKey[]).forEach(key => {
    if (!(key in source)) return
    const cleaned = clampSettingValue(key, source[key])
    ;(result as unknown as Record<SettingsKey, boolean | number>)[key] =
      typeof DEFAULT_SETTINGS[key] === 'boolean' ? Boolean(cleaned) : Number(cleaned)
  })
  return result
}

export class SettingsStore {
  private settings: DovshanitSettings

  constructor() {
    let parsed: Partial<DovshanitSettings> | undefined
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (raw) {
        const decoded: unknown = JSON.parse(raw)
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) parsed = decoded as Partial<DovshanitSettings>
      }
    } catch {
      parsed = undefined
    }
    this.settings = sanitizeSettings(parsed)
  }

  get(): DovshanitSettings {
    return this.settings
  }

  set<K extends SettingsKey>(key: K, value: DovshanitSettings[K]): void {
    this.settings = { ...this.settings, [key]: clampSettingValue(key, value) as DovshanitSettings[K] }
    this.persist()
  }

  /**
   * האם אירוע אקראי (שינה, תשומת לב, משפט אקראי, גזר משמיים) מותר כרגע:
   * מתג "אירועים אקראיים" דלוק, וגם הטלת הסיכוי הגלובלי הצליחה.
   * שיטוט וטיפוס על קופסאות הם לא "אירועים" ולא עוברים כאן.
   */
  rollRandomEvent(multiplier = 1): boolean {
    const s = this.settings
    return s.randomEventsEnabled && Math.random() <= Phaser.Math.Clamp(s.globalEventChance * multiplier, 0, 1)
  }

  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS }
    this.persist()
  }

  private persist(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings))
    } catch {
      // מצב פרטי/חסימה של localStorage לא אמור לשבור את המשחק; ההגדרות נשארות פעילות בסשן.
    }
  }
}