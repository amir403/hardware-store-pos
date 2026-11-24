# Nayi dukaan par install

Ek naye computer par POS lagane ka poora tareeqa. Is mein koi demo data ya demo
password nahi aata: pehli dafa kholne par dukaan ka naam aur maalik ka login
poocha jata hai.

## 1. Pehle yeh do cheezen install karein

PowerShell (Admin) mein:

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.17
```

PostgreSQL install karte waqt `postgres` user ka password poocha jayega. Yeh
password likh kar dukaan ke maalik ke paas mehfooz rakhen; installer bhi yahi
maangega. Dono install hone ke baad PowerShell band karke nayi kholen.

## 2. App ka folder

Code is computer par le aayen (maslan `C:\hardware-pos`), `git clone` se ya
folder copy karke. `.env`, `node_modules` aur `.next` copy **na** karein: yeh har
computer ke apne bante hain.

## 3. Installer chalayen

Usi folder mein:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

Yeh khud:

- PostgreSQL ka password poochh kar `.env` banata hai (naya `AUTH_SECRET` bhi)
- `hardware_pos` database banata hai (pehle se ho to us ka data nahi chhedta)
- packages install, tables tayyar aur app build karta hai
- auto-start aur raat 10 baje ka backup lagata hai. Backup `E:\pos-backups` mein
  jata hai; E: na ho to D:, warna C:

Waqt ya jagah badalni ho: `-BackupTime 21:00 -BackupDir D:\backups`.
Dobara chalana mehfooz hai: maujooda `.env` aur data wahi rehte hain.

## 4. Pehli dafa kholna

Browser mein `http://localhost:3000` kholen. Setup screen aayegi:

1. Dukaan ka naam, phone, pata (receipt par chhapta hai)
2. Maalik ka naam, email aur password: yeh **Admin** account hai

"Start using the POS" dabane par seedha dashboard khulta hai. Setup screen sirf
ek dafa aati hai; uske baad wahan se koi naya admin nahi ban sakta.

Phir:

- **Settings**: receipt printer ki chaudai, label size, cashier ki discount hadd
- **Users**: har cashier aur manager ka apna login
- **Products → Import**: dukaan ki purani price list Excel se ek saath. Excel mein
  "Save As → CSV UTF-8" karein; page par template bhi download ho sakta hai.
  Pehle preview aata hai (naye, update, ghaltiyan), "Import" dabane par hi save hota
  hai. Opening stock naye products ka shuru ka stock ban jata hai.

## 5. Phone aur doosre computer

`docs\phone-access.md` dekhen (Tailscale).

## Update

Naya code aane par `docs\server-setup.md` ka "Code update ke baad" hissa.
