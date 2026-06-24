import Link from "next/link";
import { EmployeeForm } from "@/components/employee-form";
import { createEmployeeAction } from "../actions";

export default function NewEmployeePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/employees" className="hover:text-slate-700">
          עובדים
        </Link>
        <span>/</span>
        <span className="text-slate-900">חדש</span>
      </div>
      <h2 className="text-2xl font-extrabold text-slate-900">הוספת עובד</h2>

      <EmployeeForm
        action={createEmployeeAction}
        submitLabel="צור עובד"
      />
    </div>
  );
}
