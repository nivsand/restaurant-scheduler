import Link from "next/link";
import { logoutAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export function TopBar({ managerName }: { managerName: string }) {
  return (
    <header className="flex h-[60px] items-center justify-between border-b border-cream-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-terracotta text-sm font-bold text-white">
          {managerName.charAt(0)}
        </div>
        <div>
          <Link
            href="/settings"
            className="text-sm font-semibold text-brown-800 hover:text-brand-600"
            title="הגדרות החשבון"
          >
            שלום, {managerName}
          </Link>
          <p className="text-[11px] text-brown-400">
            {new Intl.DateTimeFormat("he-IL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </p>
        </div>
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
