"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
  /** Echoed back so a failed attempt does not wipe what was typed. */
  email?: string;
};

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required.", email };
  }

  try {
    // redirect: false so the redirect("/") below decides where we land.
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Invalid email or password.", email };
      }
      return { error: "Something went wrong. Please try again.", email };
    }
    throw error;
  }

  redirect("/");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
