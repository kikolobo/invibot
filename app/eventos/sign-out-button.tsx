"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push("/entrar");
        router.refresh();
      }}
      className="rounded-full border border-line px-4 py-1.5 text-ink-soft transition-colors hover:border-accent hover:text-accent"
    >
      Salir
    </button>
  );
}
