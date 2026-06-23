"use client";

import { useTransition } from "react";
import { employeeLogoutAction } from "@/app/employee/actions";

export function EmployeeLogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => employeeLogoutAction())}
      disabled={pending}
      className="rounded-lg bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30 disabled:opacity-50"
    >
      {pending ? "..." : "התנתק"}
    </button>
  );
}
