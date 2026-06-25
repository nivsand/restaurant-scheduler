import Link from "next/link";
import { EmployeeForm } from "@/components/employee-form";
import { createEmployeeAction } from "../actions";

export default function NewEmployeePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-brown-500">
        <Link href="/employees" className="hover:text-brown-700">
          עובדים
        </Link>
        <span>/</span>
        <span className="text-brown-900">חדש</span>
      </div>
      <h2 className="text-2xl font-extrabold text-brown-900">הוספת עובד</h2>

      <EmployeeForm
        action={createEmployeeAction}
        submitLabel="צור עובד"
      />
    </div>
  );
}
