import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { clearSessionPath } from "@/lib/auth-routes";
import {
  getActiveManagerForSession,
  hasValidSessionUser,
} from "@/lib/session-validation";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!hasValidSessionUser(session)) redirect(clearSessionPath("/login"));

  const manager = await getActiveManagerForSession(session);
  if (!manager) redirect(clearSessionPath("/login"));

  redirect("/dashboard");
}
