import Link from "next/link";
import { logoutAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export function TopBar({ managerName }: { managerName: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        {/* Manager name links to account settings so they're easy to reach */}
        <Link
          href="/settings"
          className="text-base font-semibold text-slate-900 hover:text-brand-700"
          title="הגדרות החשבון"
        >
          שלום, {managerName}
        </Link>
        <p className="text-xs text-slate-500">
          {new Intl.DateTimeFormat("he-IL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date())}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            הגדרות
          </Button>
        </Link>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">
            התנתק
          </Button>
        </form>
      </div>
    </header>
  );
}
