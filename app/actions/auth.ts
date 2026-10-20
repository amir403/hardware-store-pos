"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", { email, password });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Invalid email or password." };
      }
      return { error: "Something went wrong. Please try again." };
    }
    throw error;
  }

  redirect("/");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
