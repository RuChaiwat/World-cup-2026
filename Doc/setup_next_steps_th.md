# Checklist การตั้งค่าและสิ่งที่ต้องทำต่อ

เอกสารนี้สรุปขั้นตอนที่ต้องทำต่อจากโค้ดปัจจุบัน เพื่อให้ระบบ World Cup 2026 Prediction ใช้งานได้จริง โดยเน้นจุดที่มักสับสนคือ LINE OA/LIFF, Frontend ผู้ใช้, Admin Panel, Google Apps Script และ GitHub Actions

## ภาพรวมสถานะปัจจุบัน

โปรเจกต์นี้มีโค้ดหลักครบ 5 ส่วนแล้ว:

1. `backend/api.js` สำหรับนำไปวางใน Google Apps Script เพื่อเป็น REST API
2. `liff-app/` สำหรับหน้าเว็บผู้ใช้งานที่เปิดผ่าน LINE LIFF
3. `admin-panel/` สำหรับหน้าเว็บผู้ดูแลระบบ
4. `scripts/` สำหรับงานอัตโนมัติ เช่น ซิงก์ผลการแข่งขันและส่ง Broadcast
5. `workflows/` สำหรับ GitHub Actions แต่ก่อนใช้งานจริงควรย้ายไฟล์ไปไว้ที่ `.github/workflows/`

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
4. เปิด `Extensions > Apps Script`
5. คัดลอกโค้ดจาก `backend/api.js` ไปวางใน Apps Script
6. เปลี่ยนค่า `ADMIN_API_KEY` ใน Apps Script เป็นรหัสลับจริง ห้ามใช้ค่าเดิมในไฟล์ตัวอย่าง
7. Deploy เป็น Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
8. คัดลอก Web App URL ที่ลงท้ายด้วย `/exec`

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
liff.init({ liffId: "<LIFF ID>" })
```

หากยังไม่มี OpenChat ให้ใส่เป็นลิงก์ LINE OA หรือซ่อนปุ่ม OpenChat ในหน้าเว็บชั่วคราว

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

### ต้องแก้ก่อน

ตอนนี้ไฟล์ workflow อยู่ในโฟลเดอร์ `workflows/` ซึ่ง GitHub Actions จะไม่ทำงานอัตโนมัติจากตำแหน่งนี้ ควรย้ายไปไว้ที่:

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
| `FOOTBALL_API_KEY` | API key จาก API-Football สำหรับซิงก์ผลจริง |
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
4. Workflow ต้องย้ายไป `.github/workflows/` ไม่เช่นนั้น GitHub Actions จะไม่รัน
5. `scripts/sync_matches.py` ยัง map `matchId` จาก Football API fixture id โดยตรง ซึ่งอาจไม่ตรงกับ `Match_ID` ใน Google Sheet ต้องทำ mapping ให้ชัดเจนก่อนใช้ production
6. ควรทดสอบ CORS/POST กับ Apps Script หลัง deploy จริง เพราะ Apps Script Web App มีพฤติกรรม redirect และ content-type เฉพาะตัว
7. Admin Panel แสดง PIN ในตารางผู้ใช้ ซึ่งเหมาะกับระบบทดลอง แต่ก่อน production ควรพิจารณาไม่แสดง PIN หรือเปลี่ยนวิธีเก็บ PIN ให้ปลอดภัยขึ้น

## 8. ลำดับงานแนะนำ

1. สร้าง Google Sheet และ Apps Script ให้ API ใช้งานได้ก่อน
2. ทดสอบ API ด้วย Admin Panel โดยเรียก `adminGetUsers` และ `adminGetMatches`
3. เพิ่มข้อมูล `User_Master` และ `Matches` ตัวอย่าง
4. Deploy `liff-app` แล้วตั้งค่า LIFF Endpoint URL
5. ทดสอบผู้ใช้ 1 คนลงทะเบียนและทายผล
6. Deploy `admin-panel` แล้วทดสอบ reset PIN และ override score
7. ย้าย workflow ไป `.github/workflows/` และเพิ่ม GitHub Secrets
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
