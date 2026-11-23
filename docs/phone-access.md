# Phone se dukaan ka hisaab dekhna (Tailscale)

App dukaan ke computer par chalti hai. Tailscale phone aur us computer ko ek
private network me jod deta hai, is liye maalik ghar ya kahin se bhi app khol
sakta hai. Internet par kisi aur ko yeh nazar nahi aati, sirf aap ke Tailscale
account ke devices ko. Tailscale personal use ke liye muft hai.

## Ek dafa ka setup

### 1. Account
<https://tailscale.com> par **Get started** dabayen aur Google account se sign up
karen. Yahi account computer aur phone dono par use hoga.

### 2. Dukaan ka computer
1. <https://tailscale.com/download/windows> se Tailscale install karen.
2. Install ke baad usi account se login karen.
3. <https://login.tailscale.com/admin/machines> par computer ka naam dekh len,
   maslan `dukaan-pc`. Zaroorat ho to wahin se naam badal sakte hain.

### 3. HTTPS on karen (phone par app jaisa icon banne ke liye zaroori)
1. <https://login.tailscale.com/admin/dns> par **MagicDNS** on karen.
2. Usi page par **HTTPS Certificates** ko **Enable** karen.
3. Dukaan ke computer par PowerShell khol kar yeh chalayen:

   ```powershell
   tailscale serve --bg 3000
   ```

   Yeh ek pakka `https://` link dikhayega, maslan
   `https://dukaan-pc.tail1234.ts.net`. Yeh link save kar len. `--bg` ki wajah
   se yeh computer restart ke baad bhi chalta rehta hai.

   Agar `tailscale` "not recognized" aaye to PowerShell Tailscale install hone se
   pehle khuli thi: window band karke nayi kholen, ya poora path likhen:
   `& "C:\Program Files\Tailscale\tailscale.exe" serve --bg 3000`

### 4. Maalik ka phone
1. Play Store ya App Store se **Tailscale** install karen.
2. Usi account se login karen aur **Connect** on rakhen.
3. Chrome (Android) ya Safari (iPhone) me upar wala `https://…ts.net` link kholen
   aur apne user se login karen.
4. Home screen par icon:
   - **Android, Chrome:** ⋮ menu → **Add to Home screen** → **Install**.
   - **iPhone, Safari:** Share button → **Add to Home Screen**.

Ab icon dabane par app bina browser bar ke poori screen par khulegi. Roz ka
hisaab **Daily closing** (Roman Urdu me "Roz ka hisaab") me milta hai.

## Yaad rakhne wali baatein
- Dukaan ka computer on hona chahiye aur app chal rahi honi chahiye.
- Dukaan ka internet band ho to phone se dekhna ruk jaayega, lekin dukaan me POS
  chalta rahega.
- Phone kho jaaye to <https://login.tailscale.com/admin/machines> se us phone ko
  **Remove** kar den. Phir us ki access foran khatam ho jaayegi.
- Maalik ke liye alag user banayen (Users page se). Cashier ka password share na karen.
