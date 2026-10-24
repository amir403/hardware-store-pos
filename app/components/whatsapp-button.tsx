import { MessageCircleIcon } from "lucide-react";
import { whatsappLink } from "@/app/lib/whatsapp";

/** Opens WhatsApp (app or web) with the message filled in; the user presses send. */
export function WhatsAppButton({
  phone,
  text,
  label = "WhatsApp",
  compact = false,
}: {
  phone: string | null | undefined;
  text: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <a
      href={whatsappLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      title={phone ? `Send to ${phone} on WhatsApp` : "Choose a WhatsApp chat"}
      className={
        compact
          ? "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 print:hidden"
          : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 print:hidden"
      }
    >
      <MessageCircleIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </a>
  );
}
