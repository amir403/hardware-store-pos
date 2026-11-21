# Dukaan ka computer: server, auto-start aur backup

Database: PostgreSQL 18 (Windows service, computer on hote hi khud chalti hai), database `hardware_pos`, port 5432.
`.env` mein `DATABASE_URL` isi ki taraf hai.

## Do scheduled tasks

`scripts\install-tasks.ps1` ne Windows Task Scheduler mein do kaam bana diye hain:

| Task | Kab | Kya karta hai |
|---|---|---|
| Hardware POS server | Windows login par | `scripts\start-pos.ps1`: production app port 3000 par (`npm start`). Crash ho to 3 dafa dobara chalata hai. Log: `logs\server.log` |
| Hardware POS backup | Roz raat 10 baje (computer band tha to agli dafa on hote hi) | `scripts\backup-db.ps1`: `E:\pos-backups` mein backup, aakhri 30 rakhta hai. Log: `E:\pos-backups\backup.log` |

Tasks dobara banane ya backup ka waqt badalne ke liye:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-tasks.ps1 -BackupTime 21:00
```

## Code update ke baad

Production app purana build chalati hai. Har update ke baad:

```powershell
Stop-ScheduledTask -TaskName "Hardware POS server"
npm.cmd run build
Start-ScheduledTask -TaskName "Hardware POS server"
```

Migration aayi ho to build se pehle `npx.cmd prisma migrate deploy` bhi chalayen.
Development (`npm run dev`) karni ho to pehle server task band karein, dono port 3000 mangte hain.

## Backup ki doosri copy

Sirf isi computer par backup kaafi nahi (hard disk kharab ya chori). `.env` mein yeh line daal dein,
har backup wahan bhi copy ho jayega (aakhri 30):

```
BACKUP_COPY_DIR="\\100.1.1.250\databases\hardware-pos"
```

USB drive (maslan `F:\pos-backups`) ya Google Drive ka folder bhi de sakte hain. Mapped drive letter (Y:)
ki bajaye poora `\\...` path likhein. Copy na ho sake to bhi local backup ban jata hai, sirf log mein WARNING aati hai.

Haftay mein ek dafa `E:\pos-backups\backup.log` dekh lein ke roz `ok` likha aa raha hai.

## Backup se wapas laana (restore)

Yeh maujooda data ko backup se badal deta hai. Pehle server task band karein:

```powershell
Stop-ScheduledTask -TaskName "Hardware POS server"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --clean --if-exists --no-owner -h localhost -U postgres -d hardware_pos "E:\pos-backups\hardware_pos-YYYY-MM-DD_HHMM.dump"
Start-ScheduledTask -TaskName "Hardware POS server"
```

Password PostgreSQL wala poochega.
