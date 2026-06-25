"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

interface NavItemWithGate extends NavItem {
  adminOnly?: boolean;
}

const items: NavItemWithGate[] = [
  {
    href: "/dashboard",
    label: "לוח בקרה",
    icon: <DashboardIcon />,
  },
  {
    href: "/employees",
    label: "עובדים",
    icon: <UsersIcon />,
  },
  {
    href: "/shift-template",
    label: "תבנית משמרות",
    icon: <GridIcon />,
  },
  {
    href: "/availability",
    label: "זמינות",
    icon: <CalendarIcon />,
  },
  {
    href: "/schedule",
    label: "סידור שבועי",
    icon: <ScheduleIcon />,
  },
  {
    href: "/export",
    label: "ייצוא",
    icon: <PrintIcon />,
  },
  {
    href: "/analytics",
    label: "אנליטיקס",
    icon: <AnalyticsIcon />,
  },
  {
    href: "/users",
    label: "ניהול משתמשים",
    icon: <UserCogIcon />,
    adminOnly: true,
  },
  {
    href: "/settings",
    label: "הגדרות",
    icon: <SettingsIcon />,
  },
];

export function Sidebar({
  restaurantName,
  isAdmin,
}: {
  restaurantName?: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const visibleItems = items.filter((item) => !item.adminOnly || isAdmin);
  return (
    <aside className="hidden w-64 shrink-0 border-s border-brown-700/20 bg-navy md:flex md:flex-col">
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-terracotta text-white shadow-md shadow-brand-500/30">
            <ScheduleIcon />
          </span>
          <div>
            <div className="text-sm font-bold text-white">סידור משמרות</div>
            <div className="text-xs text-brown-400">{restaurantName || ""}</div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-brown-400">ניווט</div>
      </div>
      <nav className="flex-1 px-3 pb-6">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group mb-1 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-500/15 text-brand-300"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white/90",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "transition-colors",
                    active ? "text-brand-400" : "text-brown-400",
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </span>
              {item.comingSoon && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-brown-400">
                  בקרוב
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function ScheduleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}
function PrintIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
function UserCogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15H6a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <circle cx="18" cy="15" r="3" />
      <path d="M18 11.5v1M18 17.5v1M21 13.2l-.9.5M15.9 16.3l-.9.5M21 16.8l-.9-.5M15.9 13.7l-.9-.5" />
    </svg>
  );
}
function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
