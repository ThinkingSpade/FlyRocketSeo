import { useLoaderData } from "@tanstack/react-router";
import { isEmailVerificationBypassed } from "@/lib/auth-mode";

export function useEmailVerificationBypassed() {
  const runtimeConfig = useLoaderData({ from: "__root__" });

  return isEmailVerificationBypassed(runtimeConfig.emailVerificationBypassed);
}
