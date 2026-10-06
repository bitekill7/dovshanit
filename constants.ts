/* ============================================================
 *  קבועים משותפים לכל המודולים (מקור אמת יחיד)
 * ============================================================ */

// --- מפתחות טקסטורה ---
export const BUNNY_TEXTURE_KEY = 'dovshanit'
export const CARROT_TEXTURE_KEY = 'carrot'
export const BALL_TEXTURE_KEY = 'ball'

// --- פיזיקה ---
export const GRAVITY_Y = 1000

// --- רצפה / סרגל משימות ---
export const TASKBAR_FALLBACK_OFFSET = 36
export const TASKBAR_FEET_SINK = 6 // כמה פיקסלים הרגליים "שקועות" בסרגל (0 = ממש על הקצה)

// --- תנועה כללית ---
export const DRAG_X = 220
export const WALK_SPEED = 130
export const CHASE_SPEED = 190 // מהירות כשהיא רודפת אחרי גזר
export const REPEL_RADIUS = 130
export const REPEL_ACCEL = 900
export const MAX_FLEE_SPEED = 320
export const DIZZY_MS = 2500
export const MAX_TILT_DEG = 25

// --- גרירה וזריקה ---
export const DRAG_SMOOTH_MS = 45
export const GRAB_CONFIRM_MS = 180
export const GRAB_CONFIRM_PX = 8
export const MAX_THROW_SPEED = 1400
export const THROW_SPEECH_SPEED = 750

// --- מגבלות קפיצה (מקור אמת יחיד לכל היכולות האנכיות שלה) ---
export const MAX_JUMP_HEIGHT = 300 // תקרת בטיחות לקפיצה מתוך ההגדרות
export const MIN_JUMP_HEIGHT = 120
export const DEFAULT_JUMP_HEIGHT = 220 // ברירת מחדל נמוכה יותר לקפיצה טבעית
export const LEAP_APEX_MARGIN = 24 // מרווח קטן מעל משטח היעד
export const MAX_LEAP_VX = 460
export const LEAP_STANDOFF_BASE = 50
export const LEAP_TIMEOUT_MS = 3000 // אחרי כמה זמן "קפיצה מכוונת" מבוטלת אם לא נחתה

// --- קופסאות ---
export const MAX_BOXES = 5
export const BOX_MIN_W = 48
export const BOX_MIN_H = 36
export const BOX_MAX_W = 600
export const BOX_MAX_H = 500
export const HANDLE_SIZE = 14
export const BOX_CLIMB_CHANCE = 0.75 // סיכוי שבכל "מחשבה" היא תחליט לטפס על קופסה

// --- גזרים ---
export const MAX_CARROTS = 3
export const CARROT_SKY_LIFETIME_MS = 25000
export const CARROT_USER_LIFETIME_MS = 90000
export const MAX_CARROT_THROW = 900
export const OFFER_RADIUS = 180 // המשתמש מחזיק גזר קרוב אליה
export const GIFT_RADIUS = 260 // המשתמש הפיל גזר קרוב אליה
export const CARROT_PICKUP_RANGE = 18
export const HUNGER_MS = 70000
export const BEG_EVERY_MS = 20000
export const STUFFED_COUNT = 3
export const STUFFED_WINDOW_MS = 40000

// --- כדור ---
export const BALL_RADIUS = 18
export const BALL_INTEREST_MS = 25000 // כמה זמן היא משחקת בכדור בלי שהמשתמש נוגע בו, לפני שמשתעממת
export const BALL_KICK_COOLDOWN_MS = 350
export const MAX_BALL_THROW = 1100

// --- ליטוף (מהירויות ב-px/s) ---
export const PET_STROKE_MIN_SPEED = 25 // איטי מזה = הסמן סתם עומד, לא מלטף
export const PET_STROKE_MAX_SPEED = 320 // מהיר מזה = העברה מהירה של הסמן, לא ליטוף
export const PET_REQUIRED_MS = 1000 // כמה זמן ליטוף רציף נדרש עד שהיא מגיבה
export const PET_MIN_REVERSALS = 2 // לפחות שני היפוכי כיוון: ליטוף הוא תנועה הלוך-חזור
export const PET_REVERSAL_PX = 14 // כמה פיקסלים בכיוון ההפוך נחשבים להיפוך (מסנן רעידות)
export const PET_GRACE_MS = 900 // כמה זמן בלי תנועת ליטוף עד שהיא מפסיקה ליהנות
export const PET_BLOCK_AFTER_GRAB_MS = 1500 // אחרי אחיזה/לחיצה לא מתחילים ליטוף
export const CALM_GAIN_SPEED = 140 // סמן איטי מזה לאורך זמן = היא נרגעת ולא בורחת
export const CALM_LOSE_SPEED = 360 // סמן מהיר מזה = הבהלה, היא שוב בורחת
export const CALM_HOLD_MS = 350

// --- שינה ותשומת לב ---
export const NAP_IDLE_MS = 45000
export const WAKE_RADIUS = 150
export const INTERACTION_RADIUS = 250
export const ATTENTION_IDLE_MS = 30000
export const ATTENTION_COOLDOWN_MS = 25000
export const ATTENTION_NOTICE_MS = 10000

// --- דיבור ---
export const GLOBAL_SPEECH_GAP_MS = 800