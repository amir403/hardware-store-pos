import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { needsSetup } from "@/app/lib/setup";
import { SetupForm } from "@/app/components/setup-form";

export const metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <Wrench className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome to Hardware POS</h1>
            <p className="mt-1 text-sm text-zinc-500">Two quick steps and the shop is ready to sell.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <SetupForm />
        </div>
      </div>
    </div>
  );
}
