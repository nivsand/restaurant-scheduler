import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EmployeeForm } from "@/components/employee-form";
import {
  updateEmployeeAction,
  setArchivedAction,
  regenerateTokenAction,
  setEmployeePasswordAction,
  clearEmployeePasswordAction,
} from "../actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShareFormCard } from "@/components/share-form-card";
import { EmployeeCredentialsCard } from "@/components/employee-credentials-card";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const restaurantId = session!.user.restaurantId;

  const employee = await prisma.employee.findFirst({
    where: { id, restaurantId },
  });
  if (!employee) notFound();

  const updateForId = updateEmployeeAction.bind(null, id);
  const archiveForId = setArchivedAction.bind(null, id, true);
  const restoreForId = setArchivedAction.bind(null, id, false);
  const regenerateForId = regenerateTokenAction.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/employees" className="hover:text-slate-700">
          עובדים
        </Link>
        <span>/</span>
        <span className="text-slate-900">{employee.name}</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900">עריכת עובד</h2>

      <EmployeeForm
        action={updateForId}
        initial={{
          name: employee.name,
          role: employee.role as "kitchen" | "floor" | "both",
          email: employee.email,
          maxShifts: employee.maxShifts,
          minShifts: employee.minShifts,
          onlyMornings: employee.onlyMornings,
          onlyEvenings: employee.onlyEvenings,
          noClosings: employee.noClosings,
          weekendOk: employee.weekendOk,
          notes: employee.notes,
        }}
        submitLabel="שמור שינויים"
      />

      <EmployeeCredentialsCard
        employeeId={employee.id}
        hasEmail={!!employee.email}
        hasPassword={!!employee.passwordHash}
      />

      <ShareFormCard path={`/a/${employee.submissionToken}`} />

      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-900">
              חידוש קישור
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              ייצור קישור חדש ויבטל את הקודם — שימושי אם הקישור הישן דלף.
            </p>
          </div>
          <form action={regenerateForId}>
            <Button type="submit" variant="ghost" size="sm">
              חדש קישור
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {employee.archived ? "ארכיון" : "אזור סכנה"}
          </CardTitle>
        </CardHeader>
        <CardBody>
          {employee.archived ? (
            <form action={restoreForId}>
              <Button type="submit" variant="secondary">
                שחזור מארכיון
              </Button>
            </form>
          ) : (
            <form action={archiveForId}>
              <Button type="submit" variant="danger">
                העברה לארכיון
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                עובדים בארכיון לא יופיעו ברשימת הסידור.
              </p>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
