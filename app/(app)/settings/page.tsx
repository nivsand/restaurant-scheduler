import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { clearSessionPath } from "@/lib/auth-routes";
import {
  getActiveManagerForSession,
  hasValidSessionUser,
} from "@/lib/session-validation";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ProfileForm,
  ChangePasswordForm,
  RestaurantForm,
} from "@/components/settings-forms";

export default async function SettingsPage() {
  // Validate the session gracefully (same pattern as the layout/dashboard).
  // Using findUniqueOrThrow here previously crashed the route when a stale
  // JWT id no longer matched a Manager row — it threw before the layout's
  // redirect resolved. This never throws.
  const session = await auth();
  if (!session) redirect("/login");
  if (!hasValidSessionUser(session)) redirect(clearSessionPath("/login"));

  const manager = await getActiveManagerForSession(session);
  if (!manager) redirect(clearSessionPath("/login"));

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: manager.restaurantId },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">הגדרות</h2>
        <p className="text-sm text-slate-500">ניהול חשבון המנהל/ת</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי המקום</CardTitle>
        </CardHeader>
        <CardBody>
          <RestaurantForm defaultName={restaurant?.name ?? ""} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פרטים אישיים</CardTitle>
        </CardHeader>
        <CardBody>
          <ProfileForm defaultName={manager.name} defaultEmail={manager.email} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>החלפת סיסמה</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
