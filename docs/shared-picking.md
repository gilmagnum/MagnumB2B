# מפרט: ליקוט משותף (פיצול שורות) — MagnumB2B

סטטוס: **מאושר לבנייה** (גיל, 2026-10-19). לבנות מאחורי דגל כבוי בייצור; סקירת אבטחה לפני הפעלה.

## 1. מטרה וזרימה
לאפשר לשני מלקטים לעבוד על אותה הזמנה בו-זמנית, בבטחה, ע"י **חלוקת השורות** — כל מלקט עובד על קבוצת שורות זרה, אז אין שתי כתיבות לאותה שורה.

**זרימה:**
1. מלקט **A** נכנס להזמנה — רגיל כמו היום.
2. מופיע כפתור **"פצל ליקוט"** → A בוחר את השורות שלו (צ'קבוקסים) → אישור. השורות שנבחרו משויכות ל-A; כל השאר **משוחררות** (פנויות). ההזמנה עוברת למצב `split`, A = **owner** (הפותח).
3. מלקט **B** רואה את ההזמנה בתור עם chip **"ליקוט חלקי — {A}"** (במקום 🔒 נעול) ונכנס. B רואה את שורות A כ"אצל {A}" (קריאה בלבד), ואת השורות הפנויות לליקוט. כפתור **"קח את יתר השורות"** משייך את כולן ל-B (או שיוך אוטומטי בעריכה).
4. כל מלקט מלקט את החלק שלו.
5. B לוחץ **"סיימתי את החלק שלי"** (סימון רך — לא כתיבה לחשבשבת).
6. **A (או מנהל) סוגר סופית:** רואה את התקדמות כולם, מעדכן **חבילות/משטחים (M1001/M1002)**, ולוחץ סיום. רק סגירה אחת נכתבת לחשבשבת. נרשם **"לוקט ע"י {A}+{B}"**.

**החלטות שנקבעו:**
- **2 מלקטים** בשלב זה (המודל תומך ב-N; ה-UI והתפיסה יוגבלו ל-2 משתתפים בפועל).
- **מנהל יכול לסגור** במקום ה-owner (אם עזב/לא זמין).
- **אזהרה לפני סגירה** אם משתתף לא סימן "סיימתי", או אם נותרו שורות לא-לוקטו.
- מי שמפצל = **הפותח** (הראשון שנכנס); הוא ה-owner והסוגר.

## 2. מודל נתונים (Supabase — שינוי סכימה, גיל מריץ את ה-SQL)

```sql
-- מצב פר-שורת-הזמנה: שיוך + התקדמות. רק הבעל כותב picked_qty של השורה שלו.
create table if not exists public.picking_lines (
  stock_id            bigint      not null,
  line_key            text        not null,
  assigned_picker_id  uuid        references auth.users(id),
  assigned_picker_name text,
  picked_qty          integer     not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (stock_id, line_key)
);

-- משתתפים בהזמנה (נוכחות + "סיימתי את חלקי" + הערות פר-מלקט).
create table if not exists public.picking_participants (
  stock_id     bigint      not null,
  picker_id    uuid        not null references auth.users(id),
  picker_name  text,
  part_done    boolean     not null default false,
  notes        text,
  updated_at   timestamptz not null default now(),
  primary key (stock_id, picker_id)
);

-- הרחבת כותרת ההזמנה הקיימת:
alter table public.picking_sessions
  add column if not exists owner_id   uuid,
  add column if not exists owner_name text,
  add column if not exists mode       text not null default 'solo';  -- 'solo' | 'split'

-- RLS: כמו picking_logs/picking_sessions — קריאה/כתיבה דרך service_role (server actions).
-- (האפליקציה ניגשת אך ורק דרך server actions עם בדיקת תפקיד מלקט/מנהל — ראה סעיף 6.)
alter table public.picking_lines enable row level security;
alter table public.picking_participants enable row level security;
```

הערה: היום "סולו" = blob JSON ב-`picking_sessions.progress`. ביעד, סולו = כל השורות משויכות למלקט אחד ב-`picking_lines` — אותו מודל בדיוק. כשהדגל דלוק, גם סולו וגם פיצול עוברים דרך `picking_lines`; מאחורי דגל כבוי נשאר הנתיב הישן (blob) ללא שינוי.

## 3. Server actions (web/app/picking-actions.ts)
כולן דרך `pickingUser()` הקיים (מלקט או מנהל+). כתיבות אטומיות.

- `openPickingSession(stockId, pickerName)` — כמו היום; אם `mode='split'` מחזיר גם את מפת השיוך + המשתתפים (לא חוסם — מצב משותף).
- `splitPickingSession(stockId, lineKeys[])` — ה-owner בוחר את שורותיו: מגדיר `mode='split'`, `owner=me`, משייך את `lineKeys` אליי, שאר השורות → `assigned=null` (פנויות). רושם אותי ב-participants.
- `claimLines(stockId, lineKeys[])` — "קח את יתר השורות": עדכון מותנה אטומי `set assigned=me where assigned is null` (מונע תפיסה כפולה). מגביל ל-2 משתתפים: 403 אם כבר יש 2 אחרים.
- `savePickingLine(stockId, lineKey, qty)` — שמירת כמות על שורה **שלי בלבד** (בדיקת assignee); heartbeat.
- `markPartDone(stockId, done)` — סימון/ביטול "סיימתי את חלקי" למשתתף.
- `finalizePickingSession(stockId, body)` — **owner או מנהל בלבד**: מאחד את כל ה-`picked_qty` → קורא ל-`bridge.finishPicking` (שדה picker = שמות כל המשתתפים מחוברים, "A + B"), כותב picking_log, מנקה את ה-session. אידמפוטנטי.
- `releaseLine(stockId, lineKey)` / שחרור שורות תקועות של משתתף לא-פעיל (owner/מנהל).
- `getActiveLocks` מורחב: להבחין בין `solo` (🔒 נעול) ל-`split` (ניתן להיכנס, "ליקוט חלקי — {owner}").

## 4. שינויי UI
**web/app/picking/[stockId]/page.tsx:**
- כפתור **"פצל ליקוט"** (מופיע כשהדגל דלוק ואין עדיין פיצול) → מצב בחירת שורות (צ'קבוקסים) → "אשר פיצול".
- כשמשותף: כל שורה מציגה **אצל מי היא** ("אצל {שם}" / "פנויה" / "שלי"). שורות שאינן שלי — קריאה בלבד.
- כפתור **"קח את יתר השורות"** למלקט הנכנס (אם יש פנויות).
- כפתור **"סיימתי את החלק שלי"** למשתתף שאינו ה-owner.
- ל-owner/מנהל: **"סיום ליקוט"** עם דיאלוג המציג **סטטוס לכל משתתף** + חבילות/משטחים + **אזהרה** אם מישהו לא סימן "סיימתי" או שנותרו שורות לא-לוקטו.
- הגדלות התצוגה הקיימות (תמונה/מק"ט/כמות) נשמרות.

**web/app/picking/page.tsx (תור):**
- הזמנה במצב `split` מציגה chip **"ליקוט חלקי — {owner}"** וניתנת לכניסה (לא נעולה).

## 5. סיום וייחוס
- `finalizePickingSession` מאחד `picked_qty` מכל השורות (כל המלקטים) למערך `finishPicking.lines[]`. **אין שינוי בגשר** — reduce/delete + שורות אריזה כבר נתמכים.
- `picker` שנשלח לגשר = שמות המשתתפים מחוברים: `"A + B"` → נכתב ב-ExtraText2 ובלוג ("לוקט - A + B").
- חוסרים: מאוחדים מכל השורות.

## 6. בטיחות ותחרותיות
- שורה נערכת **רק ע"י בעליה** (בדיקת assignee בכל `savePickingLine`) → אין דריסה.
- תפיסה = **עדכון מותנה אטומי** (`where assigned is null`) → אין תפיסה כפולה; הגבלת 2 משתתפים.
- **סיום יחיד, owner/מנהל בלבד, אידמפוטנטי** — הגשר שומר מפני כתיבה כפולה (NOT_OPEN/produced).
- כל ה-actions מאחורי `pickingUser()` (מלקט/מנהל+); אין גישה ישירה מהלקוח לטבלאות (RLS + service_role).
- heartbeat פר-משתתף; owner/מנהל יכולים לשחרר שורות של משתתף לא-פעיל.

## 7. מקרי קצה
- **owner עזב לפני סיום** → מנהל סוגר (מאושר).
- **סגירה ו-B לא סיים** → מותר, עם אזהרה; שורות לא-לוקטו = חוסרים (כמו סולו).
- **B מנסה לתפוס שורה שכבר נתפסה** → נדחה אטומית, רענון מצב.
- **מלקט שלישי מנסה להצטרף** → נחסם (מגבלת 2).
- **נפילת רשת באמצע** → ההתקדמות פר-שורה כבר נשמרה; המשך מהמצב השמור.

## 8. דגל ורולאאוט
- דגל `shared_picking_enabled` ב-`app_settings` (ברירת מחדל false), נקרא בצד הלקוח; טוגל במסך הניהול. כבוי = התנהגות היום בדיוק (נתיב blob).
- בנייה → בדיקה מקומית/טסט → **סקירת אבטחה** → הפעלת הדגל בייצור.
- שינוי הסכימה (סעיף 2) חייב לרוץ **לפני** הדחיפה של הקוד שקורא לטבלאות החדשות (אחרת 400). רץ בחלון ההעלאות.

## 9. מקרי בדיקה (קבלה)
1. סולו (דגל כבוי) — ללא שינוי.
2. A מפצל, B לוקח את השאר — כל אחד רואה רק את שלו; אין דריסה.
3. שני שינויים בו-זמנית על שורות שונות — שניהם נשמרים.
4. ניסיון לערוך שורה של האחר — חסום.
5. B מסמן "סיימתי"; A סוגר → נכתב "לוקט ע"י A+B", כמויות מאוחדות, חבילות/משטחים של A.
6. A סוגר לפני ש-B סיים → אזהרה; שורות B הלא-לוקטו = חוסרים.
7. owner עזב → מנהל סוגר.
8. מלקט שלישי נחסם.
