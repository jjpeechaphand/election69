# Election 69 · ผลการเลือกตั้ง สส. 8 กุมภาพันธ์ 2569

แดชบอร์ดผลการเลือกตั้งทั่วไปของไทย 2 หน้า (ภาพรวม และวิเคราะห์ข้อมูล) จากผลที่ กกต. ประกาศ ใช้ได้ทั้งภาษาไทยและภาษาอังกฤษ จัดทำเพื่อการศึกษาในรายวิชา Data Visualization

## เปิดดู
- **ออนไลน์:** https://jjpeechaphand.github.io/election69/ (ใช้ได้ทั้งบนคอมพิวเตอร์และมือถือ)
- **ในเครื่อง:** ดาวน์โหลดแล้วดับเบิลคลิก `index.html` (ใช้ข้อมูลจาก `data/bundle.js`)

## อัปเดตข้อมูล
ข้อมูลทั้งหมดอยู่ในไฟล์ CSV ในโฟลเดอร์ `data/2569/` แก้ไฟล์บนหน้าเว็บ GitHub แล้วกด Commit รอราว 1–2 นาที ผู้ใช้กดปุ่มอัปเดต (ไอคอนลูกศรวนมุมขวาบน) ก็เห็นข้อมูลใหม่

| อัปเดต | ไฟล์ |
|---|---|
| คะแนนผู้สมัคร | `data/2569/candidates.csv` |
| ผู้มาใช้สิทธิ บัตรดี บัตรเสีย | `data/2569/constituencies.csv` |
| คะแนนบัญชีรายชื่อ | `data/2569/party_list_votes.csv` |
| เวลาที่แหล่งข้อมูลอัปเดตผล | `data/2569/election.csv` (`source_updated_at`) |
| พรรค หัวหน้าพรรค แคนดิเดตนายกฯ | `data/2569/parties.csv` |

คู่มือฉบับเต็ม รวมถึงการเพิ่มการเลือกตั้งครั้งใหม่: [docs/DATA_EDITING_GUIDE.md](docs/DATA_EDITING_GUIDE.md)

`data/bundle.js` ใช้เฉพาะตอนเปิดจากไฟล์ในเครื่อง เว็บออนไลน์อ่าน CSV โดยตรง ถ้าแก้ CSV แล้วต้องการให้ชุดออฟไลน์ตรงกันด้วย ให้สร้างไฟล์นี้ใหม่ด้วย `scripts/build_data_bundle.py` ในโปรเจกต์ต้นฉบับ

## ที่มาและสัญญาอนุญาต
- ผลการเลือกตั้ง: สำนักงานคณะกรรมการการเลือกตั้ง (กกต.) รายละเอียดแหล่งข้อมูลอยู่ในหน้าต่าง "ที่มาข้อมูลและวิธีอ่าน" ของเว็บ
- แผนที่ประเทศไทยแบบหกเหลี่ยม: อ้างอิงรูปแบบจาก [Hex Map of Thailand](https://github.com/puripant/thailand-hex-map) ผลงานของ ผศ. ดร. ภูริพันธุ์ รุจิขจร อาจารย์ประจำภาควิชาสถิติ จุฬาลงกรณ์มหาวิทยาลัย และผู้ร่วมก่อตั้ง Boonmee Lab
- ขอบเขตเขตเลือกตั้ง: [Thai-ECT-election-map](https://github.com/KittapatR/Thai-ECT-election-map) โดย Kittapat Ratanaphupha (MIT, `geography-license.txt`)
- [D3](https://d3js.org) (ISC, `vendor/D3-LICENSE.txt`) และฟอนต์ Noto Sans Thai (SIL Open Font License, `fonts/NotoSansThai-OFL.txt`)
