# Checklist การตั้งค่าและสิ่งที่ต้องทำต่อ

เอกสารนี้สรุปขั้นตอนที่ต้องทำต่อจากโค้ดปัจจุบัน เพื่อให้ระบบ World Cup 2026 Prediction ใช้งานได้จริง โดยเน้นจุดที่มักสับสนคือ LINE OA/LIFF, Frontend ผู้ใช้, Admin Panel, Google Apps Script และ GitHub Actions

## ภาพรวมสถานะปัจจุบัน

โปรเจกต์นี้มีโค้ดหลักครบ 5 ส่วนแล้ว:

1. `backend/api.js` สำหรับนำไปวางใน Google Apps Script เพื่อเป็น REST API
2. `liff-app/` สำหรับหน้าเว็บผู้ใช้งานที่เปิดผ่าน LINE LIFF
3. `admin-panel/` สำหรับหน้าเว็บผู้ดูแลระบบ
4. `scripts/` สำหรับงานอัตโนมัติ เช่น ซิงก์ผลการแข่งขันและส่ง Broadcast
5. `.github/workflows/` สำหรับ GitHub Actions เพื่อซิงก์ผลการแข่งขันและ Broadcast อัตโนมัติ

สิ่งที่ยังต้องทำหลัก ๆ คือสร้างบัญชี/บริการภายนอก แล้วนำค่า URL, ID, Token และ Secret มาใส่ให้ถูกตำแหน่ง

## 1. ตั้งค่า Google Sheets และ Apps Script

### ต้องทำ

1. สร้าง Google Sheet 1 ไฟล์
2. สร้างแท็บให้ตรง 5 ชื่อ:
   - `User_Master`
   - `Matches`
   - `Raw_Submissions`
   - `Tournament_Winner_Submissions`
   - `Leaderboard`
3. ใส่หัวคอลัมน์ตาม `Doc/db_setup.md`
   - เปิดไฟล์ `Doc/db_setup.md` แล้วคัดลอกชื่อคอลัมน์ของแต่ละแท็บไปวางที่แถวที่ 1 ของ Google Sheet ให้ตรงตัวอักษรทุกตัว
   - ห้ามเปลี่ยนชื่อคอลัมน์ เช่น `Employee_ID`, `Match_ID`, `Kickoff_Time` เพราะ `backend/api.js` อ่าน/เขียนข้อมูลด้วยชื่อ header เหล่านี้
   - แนะนำให้ format คอลัมน์รหัส เช่น `Employee_ID`, `Match_ID`, `User_PIN` เป็น Plain text เพื่อไม่ให้ Google Sheets ตัดเลข 0 นำหน้า
   - หลังสร้าง header แล้ว ให้ใส่ข้อมูลทดสอบอย่างน้อย 1 user ใน `User_Master` และ 1 match ใน `Matches` เพื่อใช้ทดสอบ API ก่อนเชื่อม LINE
4. เปิด `Extensions > Apps Script`
   - เปิดจาก Google Sheet ไฟล์เดียวกับที่สร้างแท็บไว้ เพื่อให้ Apps Script ใช้ `SpreadsheetApp.getActiveSpreadsheet()` กับไฟล์นี้ได้ทันที
   - ตั้งชื่อ project เช่น `World Cup 2026 Prediction API` เพื่อแยกจาก script อื่นในบัญชี Google
   - หาก Apps Script ถามสิทธิ์ ให้ใช้บัญชี Google เจ้าของ Sheet หรือบัญชี service/admin ที่ทีมใช้ดูแลระบบ
5. คัดลอกโค้ดจาก `backend/api.js` ไปวางใน Apps Script
   - ใน Apps Script ให้เปิดไฟล์ `Code.gs` แล้วลบโค้ดตัวอย่างเดิมออกทั้งหมด
   - คัดลอกโค้ดทั้งหมดจาก `backend/api.js` ไปวางแทน จากนั้นกด Save
   - ไม่ต้องใช้ Node.js หรือ npm สำหรับส่วนนี้ เพราะโค้ดถูกออกแบบให้รันใน Google Apps Script runtime
   - ก่อน deploy ให้ตรวจว่าชื่อแท็บใน Google Sheet ตรงกับที่โค้ดเรียก เช่น `User_Master`, `Matches`, `Raw_Submissions`, `Tournament_Winner_Submissions`, `Leaderboard`
6. เปลี่ยนค่า `ADMIN_API_KEY` ใน Apps Script เป็นรหัสลับจริง ห้ามใช้ค่าเดิมในไฟล์ตัวอย่าง
   - ค่าเดิม `WC2026_ADMIN_SECURE_TOKEN_XYZ` เป็นแค่ตัวอย่าง ห้ามใช้จริง
   - แนะนำให้สร้าง token ยาวอย่างน้อย 32 ตัวอักษร มีตัวพิมพ์เล็ก/ใหญ่ ตัวเลข และสัญลักษณ์ เช่นสร้างจาก password manager
   - เก็บค่าเดียวกันนี้ไว้ใช้ใน Admin Panel และ GitHub Secret ชื่อ `ADMIN_API_KEY`
   - อย่าส่ง key นี้ใน LINE chat, commit ลง git, หรือใส่ในเอกสารที่แชร์ให้คนทั่วไป
7. Deploy เป็น Web App:
   - ใน Apps Script กด `Deploy > New deployment`
   - เลือก type เป็น `Web app`
   - ใส่ Description เช่น `Initial production web app`
   - ตั้ง `Execute as` เป็น `Me` เพื่อให้ API อ่าน/เขียน Google Sheet ด้วยสิทธิ์ของเจ้าของ script
   - ตั้ง `Who has access` เป็น `Anyone` เพราะ frontend, admin panel และ GitHub Actions ต้องเรียกผ่าน HTTPS ได้
   - กด Deploy แล้ว authorize สิทธิ์ที่ Apps Script ขอ โดยตรวจว่าเป็น project ที่เราสร้างเอง
8. คัดลอก Web App URL ที่ลงท้ายด้วย `/exec`
   - URL นี้คือ `API_BASE_URL` ของระบบ ให้คัดลอกเก็บไว้ทันทีหลัง deploy
   - นำไปใส่ใน `liff-app/app.js` ตรง `API_BASE_URL` และใช้กรอกใน Admin Panel ช่อง API URL
   - นำไปเพิ่มใน GitHub Actions Secret ชื่อ `API_BASE_URL`
   - หากแก้โค้ด Apps Script ภายหลัง ต้องกด deploy version ใหม่ หรือ update deployment ไม่เช่นนั้น URL เดิมอาจยังรันโค้ดเวอร์ชันเก่า
   - ทดสอบเบื้องต้นด้วยการเปิด `<Web App URL>?action=getLeaderboard` ใน browser ถ้าเชื่อมถูกต้องควรได้ JSON กลับมา ไม่ใช่หน้า HTML error

### ค่าที่ได้จากขั้นตอนนี้

| ค่า | ใช้ที่ไหน |
| --- | --- |
| Google Apps Script Web App URL | `liff-app/app.js`, Admin Panel, GitHub Secret `API_BASE_URL` |
| Admin API Key | Admin Panel, GitHub Secret `ADMIN_API_KEY` |

## 2. ตั้งค่า LINE OA และ LIFF

### ต้องทำใน LINE Developers Console

1. สร้าง Provider
2. สร้าง LINE Login Channel
3. สร้าง LIFF App ใต้ LINE Login Channel
4. กำหนด Endpoint URL เป็น URL ของเว็บ `liff-app` ที่ deploy แล้ว เช่น GitHub Pages หรือ Vercel
5. คัดลอก LIFF ID และ LIFF URL
6. เปิดสิทธิ์ที่จำเป็นสำหรับการอ่าน Profile ตามหน้าตั้งค่าของ LINE Login Channel

### ต้องทำใน LINE Official Account Manager

1. สร้างหรือเลือก LINE OA ที่จะใช้กับกิจกรรม
2. เชื่อม OA กับ Channel ใน LINE Developers ตามโครงสร้างบัญชีของ LINE
3. สร้าง Channel Access Token สำหรับ Messaging API ถ้าจะใช้ Broadcast
4. เพิ่ม Rich Menu หรือข้อความต้อนรับที่ลิงก์ไปยัง LIFF URL เช่น `https://liff.line.me/<LIFF_ID>`

### ต้องแก้ในโค้ด

ใน `liff-app/app.js` ต้องเปลี่ยนค่าเหล่านี้:

```js
const API_BASE_URL = "<Google Apps Script Web App URL>";
const OPENCHAT_URL = "<LINE OpenChat หรือ Group URL ถ้ามี>";
const SHOW_OPENCHAT = false; // เปลี่ยนเป็น true เมื่อพร้อมเปิดปุ่ม OpenChat
liff.init({ liffId: "<LIFF ID>" })
```

ตอนนี้ปุ่ม OpenChat ถูกซ่อนไว้ชั่วคราวด้วย `SHOW_OPENCHAT = false`; เมื่อพร้อมเปิดใช้งาน ให้ใส่ `OPENCHAT_URL` จริงและเปลี่ยน `SHOW_OPENCHAT` เป็น `true`

## 3. Deploy Frontend ผู้ใช้ (`liff-app`)

### ตัวเลือกที่ง่าย

- GitHub Pages
- Vercel
- Netlify
- Firebase Hosting

### ต้องจำ

- URL ที่ deploy แล้วต้องเป็น HTTPS
- URL นี้ต้องนำไปกรอกเป็น Endpoint URL ของ LIFF App
- ผู้ใช้จริงควรเปิดผ่าน LIFF URL ไม่ใช่เปิดไฟล์ `index.html` โดยตรง

## 4. Deploy Admin Panel (`admin-panel`)

Admin Panel เป็น Static HTML/CSS/JS สามารถ deploy แยกจาก LIFF ได้ เช่น GitHub Pages, Vercel หรือ Netlify

เมื่อเปิดหน้า Admin ครั้งแรก ให้กรอก:

1. API URL = Google Apps Script Web App URL ที่ลงท้าย `/exec`
2. TOKEN = ค่า `ADMIN_API_KEY` เดียวกับใน Apps Script

ระบบจะเก็บค่านี้ใน browser `localStorage` ของเครื่องแอดมิน ดังนั้นควรใช้กับเครื่องที่ไว้ใจได้เท่านั้น

## 5. ตั้งค่า GitHub Actions

ไฟล์ workflow ถูกจัดไว้ในตำแหน่งที่ GitHub Actions ใช้งานได้แล้ว:

```text
.github/workflows/sync_matches.yml
.github/workflows/daily_broadcast.yml
```

### ต้องเพิ่ม Repository Secrets

ไปที่ GitHub repository > Settings > Secrets and variables > Actions แล้วเพิ่ม:

| Secret | ใช้ทำอะไร |
| --- | --- |
| `API_BASE_URL` | URL ของ Google Apps Script Web App |
| `ADMIN_API_KEY` | Key สำหรับเรียก API ฝั่ง Admin |
| `FOOTBALL_API_PROVIDER` | ไม่บังคับ; ค่า default คือ `football-data` ซึ่งใช้ football-data.org free tier |
| `FOOTBALL_API_KEY` | Token จาก football-data.org หรือ API key จาก provider ที่เลือกสำหรับซิงก์ผลจริง |
| `FOOTBALL_DATA_URL` | ไม่บังคับ; ค่า default คือ `https://api.football-data.org/v4/competitions/WC/matches` |
| `FOOTBALL_API_URL` | ไม่บังคับ; ใช้เฉพาะ provider `api-sports`; default คือ `https://v3.football.api-sports.io/fixtures` |
| `SYNC_BATCH_SIZE` | ไม่บังคับ; จำนวน match ต่อ 1 request ไป Apps Script ค่า default คือ `20`; ลดเป็น `10` หากยัง timeout |
| `LINE_CHANNEL_ACCESS_TOKEN` | Token ของ LINE Messaging API สำหรับ Broadcast |
| `LINE_LIFF_URL` | URL สำหรับปุ่มในข้อความ Broadcast |

## 6. ตรวจสอบข้อมูลตั้งต้นใน Google Sheets

### `User_Master`

ต้องใส่รายชื่อพนักงานล่วงหน้าอย่างน้อย:

| Employee_ID | Full_Name | User_PIN | Line_User_ID |
| --- | --- | --- | --- |
| EMP001 | Test User |  |  |

ปล่อย `User_PIN` และ `Line_User_ID` ว่างได้ ระบบจะเติมหลังพนักงานลงทะเบียนครั้งแรก

### `Matches`

ต้องมีตารางแข่งก่อน ผู้ใช้จึงจะทายผลได้ ตัวอย่าง:

| Match_ID | Home_Team | Away_Team | Kickoff_Time | Stage | Status |
| --- | --- | --- | --- | --- | --- |
| WC01 | Thailand | Japan | 2026-06-14T19:00:00Z | Group | Scheduled |

เวลาควรเก็บเป็น UTC ISO string เพราะระบบใช้ `new Date()` ในการล็อกการทายเมื่อถึงเวลา Kickoff

## 7. จุดเสี่ยงที่ควรแก้ก่อนใช้งานจริง

1. อย่า hard-code secret ใน repository เช่น `ADMIN_API_KEY`, GAS URL, LIFF ID หรือ Access Token
2. `backend/api.js` ยังใช้ค่า `ADMIN_API_KEY` แบบ hard-code ใน Apps Script ควรเปลี่ยนเป็นค่าจริงที่เดายาก หรือปรับไปใช้ `PropertiesService`
3. `liff-app/app.js` ยังมีค่าตัวอย่าง/ค่าจริงปนอยู่ ควรทำให้เป็นขั้นตอน deploy ที่ชัดเจน
4. ต้องเพิ่ม GitHub Secrets ให้ครบก่อนเปิดใช้ workflow ไม่เช่นนั้น sync/broadcast จะเรียก API ไม่ได้
5. `scripts/sync_matches.py` ตั้งค่า default เป็น provider `football-data` เพราะ free tier ของ football-data.org มี World Cup และไม่ติดข้อจำกัด season 2026 แบบ API-SPORTS free plan
6. หากใช้ API-SPORTS แบบ paid ให้ตั้ง `FOOTBALL_API_PROVIDER=api-sports` และใช้ `FOOTBALL_API_URL=https://v3.football.api-sports.io/fixtures`
7. `backend/api.js` จะพยายาม sync match ด้วย `Match_ID` ก่อน และ fallback ไปจับคู่ด้วย `Home_Team` + `Away_Team` หาก provider fixture id ไม่ตรงกับ Google Sheet
8. ถ้าเจอ `Apps Script rejected sync: Invalid POST action` ให้คัดลอก `backend/api.js` เวอร์ชันล่าสุดไปวางใน Apps Script แล้วกด Deploy/Update deployment ใหม่ เพราะ GitHub Actions ยังเรียก backend เวอร์ชันเก่า
9. workflow ใช้ `actions/checkout@v5` และ `actions/setup-python@v6` เพื่อรองรับ Node.js 24 runtime บน GitHub Actions runners
10. ควรทดสอบ CORS/POST กับ Apps Script หลัง deploy จริง เพราะ Apps Script Web App มีพฤติกรรม redirect และ content-type เฉพาะตัว
11. Admin Panel แสดง PIN ในตารางผู้ใช้ ซึ่งเหมาะกับระบบทดลอง แต่ก่อน production ควรพิจารณาไม่แสดง PIN หรือเปลี่ยนวิธีเก็บ PIN ให้ปลอดภัยขึ้น


### วิธีตรวจสอบเมื่อ Sync ผ่านแต่ `Synced 0 matches`

หาก tab `Matches` ยังเป็นค่าว่างหรือมีแค่ข้อมูลตัวอย่าง ระบบเวอร์ชันล่าสุดจะสร้างแถวใหม่จาก provider ให้เอง โดยแบ่งส่งเป็น batch เพื่อลดโอกาส Apps Script timeout และ response จะขึ้น `created X new matches` พร้อม log `New matches created in the Matches sheet`

หาก workflow ยังแสดง `Synced 0 matches` และไม่มี `created` ให้ตรวจว่า redeploy Apps Script ด้วย `backend/api.js` เวอร์ชันล่าสุดแล้วหรือยัง เพราะ backend เวอร์ชันเก่าจะไม่ append match ใหม่

หาก workflow แสดง `Unmatched matches returned by Apps Script` ให้ดูชื่อทีมจาก provider แล้วนำชื่อ `homeTeam` และ `awayTeam` ไปเทียบกับค่าใน Google Sheet tab `Matches` คอลัมน์ `Home_Team` และ `Away_Team` แบบตัวต่อตัว

จุดที่ต้องตรวจเป็นพิเศษ:

1. ค่าใน Sheet ต้องเป็นชื่อทีม ไม่ใช่ชื่อย่อหรือชื่อภาษาไทย หาก provider ส่ง `United States` แต่ Sheet ใส่ `USA` ระบบจะไม่ match
2. ลำดับเหย้า/เยือนต้องตรงกัน หาก provider ส่ง `Mexico vs Canada` แต่ Sheet ใส่ `Canada vs Mexico` ระบบจะไม่ match
3. หากรายการอยู่ใน `Skipped overridden` แปลว่า match เจอแล้ว แต่แถวใน Sheet มีค่า `Override_Home_Score` อยู่ ระบบจึงไม่เขียนทับ
4. หลังแก้ `backend/api.js` ต้อง redeploy Apps Script ก่อน จึงจะเห็น log `created`, `Unmatched` และ `Skipped overridden` จาก backend เวอร์ชันใหม่
5. หากยังเจอ read timeout ให้ตั้ง repository variable `SYNC_BATCH_SIZE=10` แล้ว run workflow ใหม่
6. หาก provider ส่งทีมว่าง เช่นรอบ knockout ที่ยังไม่รู้ทีม ระบบจะ skip match เหล่านั้นก่อน และจะ sync อีกครั้งเมื่อ provider มีชื่อทีมครบ

## 8. ลำดับงานแนะนำ

1. สร้าง Google Sheet และ Apps Script ให้ API ใช้งานได้ก่อน
2. ทดสอบ API ด้วย Admin Panel โดยเรียก `adminGetUsers` และ `adminGetMatches`
3. เพิ่มข้อมูล `User_Master` และ `Matches` ตัวอย่าง
4. Deploy `liff-app` แล้วตั้งค่า LIFF Endpoint URL
5. ทดสอบผู้ใช้ 1 คนลงทะเบียนและทายผล
6. Deploy `admin-panel` แล้วทดสอบ reset PIN และ override score
7. เพิ่ม GitHub Secrets แล้วทดสอบ workflow แบบ manual run
8. ทดสอบ `MOCK_API=true python scripts/sync_matches.py`
9. ตั้งค่า LINE Messaging API และทดสอบ Broadcast
10. ทำ security review ก่อนเปิดให้พนักงานใช้จริง

## 9. Checklist ค่าที่ต้องเตรียม

| รายการ | ได้จากที่ไหน | จำเป็นเมื่อไหร่ |
| --- | --- | --- |
| Google Sheet ID | URL ของ Google Sheet | สำหรับตรวจสอบ/ดูแลข้อมูล |
| GAS Web App URL | Apps Script Deploy | ผู้ใช้, Admin, GitHub Actions |
| Admin API Key | กำหนดเอง | Admin, Sync Job |
| LIFF ID | LINE Developers | Frontend ผู้ใช้ |
| LIFF URL | LINE Developers | Rich Menu/OA/Broadcast |
| LINE Channel Access Token | LINE Developers Messaging API | Broadcast |
| Football API Key | api-football.com | Sync ผลการแข่งขันจริง |
| Frontend URL | Hosting ที่ deploy `liff-app` | LIFF Endpoint URL |
| Admin URL | Hosting ที่ deploy `admin-panel` | ให้ผู้ดูแลระบบใช้งาน |
