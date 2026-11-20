/**
 * A wa.me link that opens WhatsApp with `text` ready to send. Pakistani local
 * numbers (03xx…) are turned into the international form WhatsApp needs; with
 * no usable number WhatsApp asks which chat to send to.
 */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  const target = digits.length >= 10 ? digits : "";
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

/** The day's closing in a few lines, for the owner's WhatsApp. Amounts come pre-formatted. */
export function dailyClosingText(opts: {
  storeName: string;
  date: string;
  bills: number;
  lines: [label: string, amount: string][];
}): string {
  return [
    `*${opts.storeName}* — ${opts.date}`,
    `Bills: ${opts.bills}`,
    ...opts.lines.map(([label, amount]) => `${label}: ${amount}`),
  ].join("\n");
}

/** Polite Roman Urdu payment reminder, the way it would be typed by hand. */
export function duesReminderText(opts: {
  storeName: string;
  customerName: string;
  amount: string;
  dueBy?: string | null;
}): string {
  return (
    `Assalam o Alaikum ${opts.customerName},\n` +
    `${opts.storeName} ke account par aap ki taraf ${opts.amount} baqi hain` +
    (opts.dueBy ? ` (adaigi ki tareekh ${opts.dueBy})` : "") +
    `.\nMehrbani karke jald adaigi kar dein. Shukriya!`
  );
}
