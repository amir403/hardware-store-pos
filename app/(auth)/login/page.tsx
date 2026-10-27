import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/app/components/login-form";
import { Wrench } from "lucide-react";

export const metadata = {
  title: "Sign in — Hardware POS",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <Wrench className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Hardware POS
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Sign in to your point of sale
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
