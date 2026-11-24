# Dukaan ka computer: server, auto-start aur backup

Database: PostgreSQL 18 (Windows service, computer on hote hi khud chalti hai), database `hardware_pos`, port 5432.
`.env` mein `DATABASE_URL` isi ki taraf hai.

## Do scheduled tasks

`scripts\install-tasks.ps1` ne Windows Task Scheduler mein do kaam bana diye hain:

| Task | Kab | Kya karta hai |
|---|---|---|
| Hardware POS server | Windows login par, aur har 5 minute (agar band ho) | `scripts\start-pos.ps1`: production app port 3000 par (`npm start`). Sleep ya log-off se band ho jaye to 5 minute ke andar khud chal jata hai. Log: `logs\server.log` |
| Hardware POS backup | Roz raat 10 baje (computer band tha to agli dafa on hote hi) | `scripts\backup-db.ps1`: `E:\pos-backups` mein backup, aakhri 30 rakhta hai. Log: `E:\pos-backups\backup.log` |

Tasks dobara banane ya backup ka waqt badalne ke liye:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-tasks.ps1 -BackupTime 21:00
```

## Code update ke baad

Production app purana build chalati hai. Naya code lane ke liye ek command (dukaan band hone ke baad behtar):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

Yeh tarteeb se: pehle backup banata hai (backup na bane to ruk jata hai), GitHub se naya code
leta hai, packages aur database update karta hai, build karta hai aur server dobara chalata hai.
Build fail ho to purana build wapas rakh kar purana version chala deta hai. Folder mein kisi ne
haath se file badli ho to kuch nahi chhedta. Server 2 se 5 minute band rehta hai.

Haath se karna ho: task pehle `Disable` karein, phir `Stop`, phir `npx.cmd prisma migrate deploy`
aur `npm.cmd run build`, phir `Enable` aur `Start`. Sirf `Stop` kaafi nahi: task har 5 minute mein
server band dekh kar chala deta hai, aur build ke beech chal jayega.
Development (`npm run dev`) karni ho to bhi pehle task `Disable` karein (dono port 3000 mangte hain) aur baad mein `Enable`.

## Backup ki doosri copy

Sirf isi computer par backup kaafi nahi (hard disk kharab ya chori). `.env` mein yeh line daal dein,
har backup wahan bhi copy ho jayega (aakhri 30):

```
BACKUP_COPY_DIR="\\100.1.1.250\databases\hardware-pos"
```

USB drive (maslan `F:\pos-backups`) ya Google Drive ka folder bhi de sakte hain. Google Drive ke liye
"Google Drive for desktop" install karein; phir `BACKUP_COPY_DIR="G:\My Drive\pos-backups"` likhein aur
Drive khud internet par chadha deta hai. Mapped drive letter (Y:) ki bajaye poora `\\...` path likhein.
Copy na ho sake to bhi local backup ban jata hai.

Haal app mein dekhen: **Settings → Backups** (aakhri backup kab bana, doosri copy gayi ya nahi,
"Back up now" button). Backup fail ho, 2 din se na bane, ya copy na ho sake to Admin ko Dashboard
par "Needs attention" mein laal line aati hai. Tafseel `E:\pos-backups\backup.log` mein.

## Backup se wapas laana (restore)

Yeh maujooda data ko backup se badal deta hai. Pehle server task band karein:

```powershell
Stop-ScheduledTask -TaskName "Hardware POS server"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --clean --if-exists --no-owner -h localhost -U postgres -d hardware_pos "E:\pos-backups\hardware_pos-YYYY-MM-DD_HHMM.dump"
Start-ScheduledTask -TaskName "Hardware POS server"
```

Password PostgreSQL wala poochega.
