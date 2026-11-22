"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast";

/**
 * A form for one-click server actions that reports back with a toast. With a
 * `message` it asks first — wrap any destructive action (deleting a payment,
 * discarding a held bill) so a stray click on a small icon cannot quietly
 * remove something.
 */
export function ConfirmForm({
  action,
  message,
  successMessage,
  className,
  doneHref,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Asked before submitting; leave out for actions that need no confirmation. */
  message?: string;
  /** Toast shown once the action has finished. */
  successMessage?: string;
  className?: string;
  /** Where to go once the action succeeds (closes the drawer the form sits in). */
  doneHref?: string;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const router = useRouter();

  async function run(formData: FormData) {
    try {
      await action(formData);
      if (successMessage) toast(successMessage);
      if (doneHref) router.replace(doneHref, { scroll: false });
    } catch (error) {
      // Thrown action errors (e.g. "Only an admin can…") are the useful text.
      toast(
        error instanceof Error && error.message
          ? error.message
          : "That did not work. Please try again.",
        "error"
      );
    }
  }

  return (
    <form
      action={run}
      className={className}
      onSubmit={(e) => {
        if (message && !window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
