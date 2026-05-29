import { auth } from "@/lib/auth";
import { clearSessionPath } from "@/lib/auth-routes";
import {
  getActiveManagerForSession,
  hasValidSessionUser,
} from "@/lib/session-validation";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!hasValidSessionUser(session)) redirect(clearSessionPath("/login"));

  // If the account was deleted or disabled during an active session, end it.
  const manager = await getActiveManagerForSession(session);
  if (!manager) redirect(clearSessionPath("/login"));

  const managerName = manager.name ?? session.user.name ?? "";
  const restaurantName = manager.restaurant?.name ?? "";

  return (
    <div className="flex min-h-screen">
      <Sidebar restaurantName={restaurantName} isAdmin={manager.isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar managerName={managerName} />
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
