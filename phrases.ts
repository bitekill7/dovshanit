/* משפטים – כל קטגוריה מתאימה לסיטואציה ספציפית אחת */
export type Category =
  | 'grab' | 'poke' | 'annoyed' | 'shake' | 'dizzyOver' | 'thrown' | 'wallHit'
  | 'landing' | 'jumpDown' | 'taunt' | 'cornered' | 'menu' | 'random' | 'greeting' | 'shutdownFear'
  | 'boxAdded' | 'boxFull' | 'boxRemoved' | 'boxClimb' | 'boxTooHigh' | 'blockedByBox'
  | 'boxCarried' | 'boxGrows' | 'boxShrinks' | 'boxOnHead'
  | 'carrotSpotted' | 'carrotAdded' | 'carrotFull' | 'carrotOffered' | 'carrotGift'
  | 'carrotTooHigh' | 'beg' | 'eat' | 'thanks' | 'thanksHand' | 'stuffed'
  | 'sleepy' | 'wakeStartled' | 'wakeRested' | 'wakeCarrot'
  | 'attention' | 'attentionFlip' | 'attentionDance' | 'noticed'
  | 'petStart' | 'petPleasant' | 'petTickle' | 'petEnd'
  | 'ballAdded' | 'ballRemoved' | 'ballKick' | 'ballHeader' | 'ballOffered' | 'ballBored'
  | 'moodShift'
  | 'hoverReset' | 'hoverSay' | 'hoverCredits' | 'hoverBox' | 'hoverCarrot'
  | 'hoverBallAdd' | 'hoverBallRemove' | 'hoverSettings' | 'hoverRemoveBoxes'

export interface SpeechRule {
  phrases: readonly string[]
  cooldown: number
  urgent?: boolean
}

export function greetingPhrases(): readonly string[] {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return ['בוקר טוב! מה קורה היום?', 'בוקר אור! כבר שתית קפה?']
  if (h >= 11 && h < 17) return ['צהריים טובים! אכלת משהו?', 'היי! איזה יום עמוס, מה?']
  if (h >= 17 && h < 22) return ['ערב טוב! איך היה היום?', 'ערב נעים! יש משהו טוב בטלוויזיה?']
  return ['לילה טוב... או שעדיין עובדים?', 'מאוחר כבר, לא הולכים לישון?']
}

export const SPEECH: Record<Category, SpeechRule> = {
  grab: {
    phrases: ['הצילו, חוטפים אותי!', 'תוריד אותי!', 'לאן אתה לוקח אותי?', 'שחרר אותי!', 'למה אתה מציק לי?'],
    cooldown: 0
  },
  poke: { phrases: ['מה אתה רוצה?', 'אל תגע בי!', 'היי! זה מדגדג.'], cooldown: 0 },
  annoyed: { phrases: ['די כבר עם הדקירות!', 'אתה מנסה לשגע אותי?', 'עוד פעם אחת ואני נעלבת!'], cooldown: 4000 },
  shake: {
    phrases: ['הכל מסתובב לי!', 'יש לי בחילה!', 'אוי, הראש שלי!', 'די, אני מקבלת סחרחורת!', 'עוד רגע אני מקיאה גזר!'],
    cooldown: 2200,
    urgent: true
  },
  dizzyOver: { phrases: ['עברה לי הסחרחורת.', 'אוף, סוף סוף הכל יציב.'], cooldown: 0 },
  thrown: { phrases: ['וואוווו, אני עפה!', 'תפסו אותי!', 'איזו טיסה!'], cooldown: 0 },
  wallHit: { phrases: ['אוף, קיר!', 'הקיר הזה הגיע משום מקום!', 'איי, זה היה קשה!'], cooldown: 3000 },
  landing: { phrases: ['די, זה כואב!', 'איי, הישבן שלי!', 'נחיתה קשה...', 'מי שם כאן רצפה?!'], cooldown: 3000 },
  jumpDown: { phrases: ['גרונימוווו!', 'אני קופצת!', 'זה לא כל כך גבוה, נכון?'], cooldown: 6000 },
  taunt: { phrases: ['אתה מכוער!', 'תמצא חיים!', 'פחחח, איטי.', 'לא תתפוס אותי!'], cooldown: 4000 },
  cornered: { phrases: ['אין לי לאן לברוח!', 'אתה לוכד אותי בפינה!', 'לא בפינה, בבקשה!'], cooldown: 6000 },
  menu: { phrases: ['מה, תפריט? מה אתה זומם?', 'הממ... מה תבחר?', 'רק בלי להשאיר אותי בחוץ!'], cooldown: 0 },
  random: {
    phrases: ['איזה יום יפה...', 'משעמם לי פה.', 'בא לי גזר.', 'היי, תראה ציפור!', 'קוראים לי דובשנית, נעים מאוד.'],
    cooldown: 0
  },
  greeting: { phrases: greetingPhrases(), cooldown: 0 },

  shutdownFear: {
    phrases: [
      'בקשה אל תעשה את זה...',
      'אני אהיה ילדה טובה באמת!',
      'לא, רק לא זה בבקשה!',
      'אני רוצה לחיות, אל תכבה אותי!',
      'בבקשה... אל תסגור אותי.',
      'אל תעשה את זה לי...',
      'אני מבטיחה להתנהג יפה!'
    ],
    cooldown: 0,
    urgent: true
  },

  boxAdded: { phrases: ['קופסה! אני אוהבת קופסאות.', 'וואו, חדש! אפשר לקפוץ עליה?', 'מישהו הזמין משלוח?'], cooldown: 0 },
  boxFull: { phrases: ['מספיק קופסאות, זה לא מחסן!', 'אין לי מקום ליותר!'], cooldown: 0 },
  boxRemoved: { phrases: ['לאן הקופסה נעלמה?', 'היא הייתה כל כך צעירה...', 'ביי ביי קופסה.'], cooldown: 0 },
  boxClimb: { phrases: ['אני המלכה של הקופסה!', 'הנוף מכאן מדהים!', 'כל העולם למטה...'], cooldown: 5000 },
  boxTooHigh: { phrases: ['גבוה מדי בשבילי...', 'אני לא ספיידרמן!', 'מי הציב את זה כל כך גבוה?'], cooldown: 8000 },
  blockedByBox: { phrases: ['הקופסה הזאת חוסמת אותי!', 'אני לא מצליחה לעבור, היא גבוהה מדי!', 'מי שם קיר באמצע הדרך?!'], cooldown: 7000 },
  boxCarried: { phrases: ['אני בנסיעה!', 'וואו, מעלית!', 'שמור על ידיים, אני עליה!'], cooldown: 6000 },
  boxGrows: { phrases: ['וואו, אני גבוהה יותר!', 'הקופסה גדלה! אני עולה!', 'הנוף משתפר!'], cooldown: 5000 },
  boxShrinks: { phrases: ['היי, הקופסה מתכווצת!', 'אני יורדת!', 'מי לחץ על הקופסה?!'], cooldown: 5000 },
  boxOnHead: { phrases: ['היי! זה נפל לי על הראש!', 'שים לב איפה אתה מניח דברים!', 'אני עוד כאן, ידידי!'], cooldown: 4000 },

  carrotSpotted: { phrases: ['גזר! אני רואה גזר!', 'הגיע משלוח גזר!', 'זה שלי, זה שלי!'], cooldown: 0 },
  carrotAdded: { phrases: ['גזר חדש! זה בשבילי?', 'יש! הגיע חטיף!'], cooldown: 0 },
  carrotFull: { phrases: ['מספיק גזרים לעכשיו!', 'אין לי מקום ליותר גזרים.'], cooldown: 0 },
  carrotOffered: { phrases: ['זה בשבילי?! תן, תן!', 'אני רואה אותו! תוריד אליי!', 'אל תיקח אותו, אני רעבה!'], cooldown: 0 },
  carrotGift: { phrases: ['הבאת לי גזר? אתה מלך!', 'וואו, זה בשבילי?!', 'ידעתי שאתה אוהב אותי!'], cooldown: 0 },
  carrotTooHigh: { phrases: ['גבוה מדי, תוריד קצת!', 'אני לא מצליחה להגיע!', 'אל תקניט אותי, הוא גבוה מדי!'], cooldown: 6000 },
  beg: { phrases: ['אפשר גזר? בבקשה?', 'הבטן שלי מקרקרת...', 'אתה לא שוכח אותי, נכון? גזר?', 'גזר אחד קטן, אני מבטיחה להיות טובה!'], cooldown: 0 },
  eat: { phrases: ['נאם נאם נאם!', 'מממ, גזר טרי!', 'זה מה שהייתי צריכה!'], cooldown: 0 },
  thanks: { phrases: ['תודה רבה! אתה הכי טוב!', 'מממ, תודה על הגזר!', 'אני חייבת לך אחת!'], cooldown: 0 },
  thanksHand: { phrases: ['ישר מהיד? תודה רבה!', 'תודה שהאכלת אותי!', 'אתה האדם האהוב עליי!'], cooldown: 0 },
  stuffed: { phrases: ['אני כבר מפוצצת, אבל עוד אחד לא יזיק.', 'עוד גזר? אני תכף מתפוצצת!'], cooldown: 0 },

  sleepy: { phrases: ['אני קצת עייפה...', 'בא לי לנמנם קצת.', 'הממ... עפעפיים כבדים.'], cooldown: 0 },
  wakeStartled: { phrases: ['אה? מה? לא ישנתי!', 'הייתי רק עוצמת עיניים!', 'מי שם?!'], cooldown: 0 },
  wakeRested: { phrases: ['ישנתי נהדר!', 'מממ, איזו תנומה.', 'בוקר טוב... נכון שעכשיו בוקר?'], cooldown: 0 },
  wakeCarrot: { phrases: ['אני מריחה גזר!', 'גזר?! איפה?!'], cooldown: 0 },
  attention: { phrases: ['היי! אני כאן!', 'מישהו שם לב אליי?', 'אפשר קצת תשומת לב?', 'אני לא שקופה, אתה יודע!'], cooldown: 0 },
  attentionFlip: { phrases: ['תראה מה אני יודעת לעשות!', 'טאדההה!', 'ציון 10 מהשופטים!'], cooldown: 0 },
  attentionDance: { phrases: ['בוא נרקוד!', 'יש לי קצב בדם!', 'מחיאות כפיים בבקשה!'], cooldown: 0 },
  petStart: { phrases: ['מממ... זה נעים!', 'אוו, איזה כיף!', 'וואו, כמה נעים...'], cooldown: 0 },
  petPleasant: { phrases: ['תמשיך, זה ממש נעים...', 'ככה, בדיוק שם...', 'אני אוהבת את זה...', 'מממ, אתה הכי טוב!'], cooldown: 3500 },
  petTickle: { phrases: ['חה חה, זה מדגדג!', 'היי, זה מדגדג לי!', 'די, אני אצחק עד מחר!'], cooldown: 3500 },
  petEnd: { phrases: ['למה הפסקת? היה כל כך נעים...', 'עוד קצת? בבקשה?', 'וואו, כמה שהייתי צריכה את זה.'], cooldown: 0 },
  ballAdded: { phrases: ['כדור! בואו נשחק!', 'וואו, כדור! תזרוק לי!', 'אני אוהבת כדורים כמעט כמו גזרים.'], cooldown: 0 },
  ballRemoved: { phrases: ['לאן הכדור נעלם?', 'היה כיף לשחק...', 'ביי ביי כדור.'], cooldown: 0 },
  ballKick: { phrases: ['גוווול!', 'בעטתי!', 'תתפוס אם אתה יכול!', 'שוט!'], cooldown: 3500 },
  ballHeader: { phrases: ['נגיחה!', 'ישר מהראש!', 'איזו נגיחה!'], cooldown: 3500 },
  ballOffered: { phrases: ['תזרוק לי אותו!', 'אני פנויה, תמסור!', 'אל תחזיק אותו רק לעצמך!'], cooldown: 0 },
  ballBored: { phrases: ['נמאס לי מהכדור... בינתיים.', 'אני צריכה הפסקה.', 'אוף, אף אחד לא זורק לי.'], cooldown: 0 },
  moodShift: { phrases: [], cooldown: 0 },
  hoverReset: { phrases: ['מה, מעבירים אותי למרכז?', 'אל תזרוק אותי באמצע המסך!', 'טלפורטציה? אני מוכנה!'], cooldown: 3000 },
  hoverSay: { phrases: ['רוצה שאדבר? יש לי המון מה לומר!', 'סוף סוף מישהו מתעניין בדעה שלי!', 'אני מוכנה לשיחה!'], cooldown: 3000 },
  hoverCredits: { phrases: ['קרדיטים? תזכיר להם שאני הכוכבת!', 'וואו, אני מפורסמת!', 'אל תשכח לציין את הגזרים!'], cooldown: 3000 },
  hoverBox: { phrases: ['קופסה חדשה? אני מתרגשת!', 'כן, כן, עוד קופסה!', 'אני כבר מתכננת איך לטפס עליה!'], cooldown: 3000 },
  hoverCarrot: { phrases: ['גזר?! תלחץ, תלחץ!', 'ריח של גזר באוויר...', 'הבטן שלי כבר מקרקרת!'], cooldown: 3000 },
  hoverBallAdd: { phrases: ['כדור! תלחץ כבר!', 'בוא נשחק!', 'אני מוכנה לנגיחה!'], cooldown: 3000 },
  hoverBallRemove: { phrases: ['מה, לוקחים לי את הכדור?', 'אל תיקח אותו, היינו באמצע משחק!', 'עוד קצת לשחק, בבקשה?'], cooldown: 3000 },
  hoverSettings: { phrases: ['הגדרות? אל תשנה לי את האופי!', 'רק בלי לעשות ממני רובוט.', 'מה אתה רוצה לשפר בי?'], cooldown: 3000 },
  hoverRemoveBoxes: { phrases: ['לא! הקופסאות שלי!', 'אל תהרוס את הבית שלי!', 'מה עשו לך הקופסאות?'], cooldown: 3000 },
  noticed: { phrases: ['סוף סוף שמת לב אליי!', 'הצלחתי! אתה מסתכל!', 'ידעתי שתיכנע בסוף.'], cooldown: 0 }
}


/** משפטים במעבר בין רמות מצב רוח (נבחרים ב-Feelings). */
export const MOOD_SHIFT: Record<'angry' | 'upset' | 'recovered' | 'happy' | 'joyful', readonly string[]> = {
  angry: ['אני כועסת עליך, תדע לך!', 'נמאס לי! די כבר!', 'אני לא מדברת איתך עכשיו.'],
  upset: ['אני קצת עצובה...', 'לא מרגישה מי יודע מה.', 'יש לי מצב רוח מבואס.'],
  recovered: ['טוב, אני כבר מרגישה יותר טוב.', 'אוקיי, אני מוכנה לסלוח.', 'אפשר להתחיל מחדש?'],
  happy: ['אני במצב רוח מעולה!', 'איזה יום נהדר!', 'אני מרגישה טוב היום!'],
  joyful: ['אני הדובשנית הכי מאושרת בעולם!', 'הכל מושלם!', 'אני פשוט מתפוצצת משמחה!']
}
