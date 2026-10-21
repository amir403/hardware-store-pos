"use client";

/**
 * A form that asks before it submits. Wrap any one-click destructive action —
 * deleting a payment, discarding a held bill — so a stray click on a small icon
 * cannot quietly remove something.
 */
export function ConfirmForm({
  action,
  message,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
