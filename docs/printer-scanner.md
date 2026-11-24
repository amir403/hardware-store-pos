# Printer, barcode scanner aur cash drawer

Dukaan ke computer par ek dafa ka setup. Sab cheezen Windows ke apne driver se chalti
hain; POS mein koi alag software nahi lagta.

## 1. Receipt printer (thermal, 80mm ya 58mm)

1. Printer ke saath aane wala Windows driver install karein (CD ya company ki website se).
   USB lagate hi Windows khud driver le aaye to woh bhi theek hai.
2. **Settings → Bluetooth & devices → Printers** mein printer kholen →
   **Printing preferences** → paper size **80 x 297 mm** (ya 58 mm) chunein.
3. Usi printer ko **Set as default** karein, taake har bill seedha usi par jaye.
4. POS mein **Settings → Receipts and labels → Receipt printer** mein wahi chaudai chunein
   (80mm ya 58mm). Bill usi chaudai mein chhapta hai.
5. **Receipt language**: gahak ko bill English mein dena hai ya Roman Urdu mein (Kul, Wusool, Baqi).

### Har dafa "Print" dialog na aaye (ek click mein bill)

Chrome ka shortcut aisa banayen ke woh dialog ke baghair default printer par chhape:

1. Desktop par Chrome ke shortcut par right click → **Properties**.
2. **Target** ke aakhir mein ek space de kar yeh jodein:
   `--kiosk-printing http://localhost:3000/pos`
3. OK. Ab isi shortcut se POS kholen; "Print" dabate hi bill nikal aayega.

Pehli dafa print dialog mein **Margins: None**, **Scale: 100**, aur **Headers and footers**
band kar dein; Chrome yeh yaad rakhta hai.

## 2. Barcode scanner

- USB scanner "keyboard" ki tarah kaam karta hai: jo barcode parhta hai woh type kar deta hai.
- Scanner ki setting mein **Enter (CR) suffix** on hona chahiye (zyada tar scanners mein
  pehle se on hota hai). Check: Notepad kholen, kuch scan karein; number likh kar cursor
  agli line par chala jaye to theek hai. Na jaye to scanner ki manual se "Add CR suffix"
  wala barcode scan karein.
- **Naya Bill** screen par search box mein cursor ho to scan karte hi cheez seedha bill mein
  aa jati hai (barcode ya SKU poora milta ho to).
- Jis maal par barcode nahi, us ke liye **Labels** page se apne barcode label chhap sakte hain.

## 3. Label printer (barcode stickers)

- Label printer ka driver install karein aur us ki **Printing preferences** mein label ka
  size wahi rakhein jo aap ke rolls ka hai (maslan 50 x 25 mm).
- POS mein **Settings → Barcode labels** mein wahi size chunein. Labels page par print
  karte waqt Chrome ke dialog mein label printer chunein, **Margins: None**, **Scale: 100**.
- Label printer ko default na banayen; default receipt printer hi rahe.

## 4. Cash drawer (galla)

- Zyada tar cash drawer printer ke peeche wale **RJ11 (DK)** port mein lagta hai aur
  printer ke kehne par khulta hai.
- Printer ki **Printing preferences** mein "Cash drawer" / "Open drawer" ki setting ko
  **before printing** (ya "Document start") par kar dein. Ab har bill chhapte hi galla khulega.

## Masla ho to

| Masla | Hal |
|---|---|
| Bill bohot chhota ya kona kata hua | Print dialog mein Scale 100 aur Margins None; Settings mein sahi chaudai |
| Bill ke neeche bohot khali kaghaz | Driver mein paper size "80 x 297" ki bajaye "80 x receipt" / "continuous" chunein |
| Scan karne par kuch nahi hota | Cursor Naya Bill ke search box mein rakhein; scanner ka Enter suffix check karein |
| Scan hota hai par cheez nahi milti | Product ke Barcode khane mein wahi number darj hai? (Products → product kholen) |
| Galla nahi khulta | Cable printer ke DK port mein; driver mein "open drawer" on |
