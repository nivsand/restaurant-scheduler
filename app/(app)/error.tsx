"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-bold text-brown-900">משהו השתבש</h2>
      <p className="max-w-md text-sm text-brown-500">
        אירעה שגיאה בטעינת העמוד. נסו לרענן או לחזור לדף הבית.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset} variant="secondary">
          נסה שוב
        </Button>
        <Link href="/dashboard">
          <Button>חזרה לדף הבית</Button>
        </Link>
      </div>
    </div>
  );
}
