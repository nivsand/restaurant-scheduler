// Server component that fetches the sharing context and renders a clear set
// of options for sending the per-employee link.

import { sharingContext } from "@/lib/network";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableLink } from "@/components/copyable-link";

export async function ShareFormCard({
  path,
  label,
}: {
  path: string; // e.g. "/a/ABC123..."
  label?: string;
}) {
  const ctx = await sharingContext();

  const localUrl = `http://${ctx.requestHost}${path}`;
  const lanUrls = ctx.lanBases.map((b) => `${b}${path}`);
  const publicUrl = ctx.publicBase ? `${ctx.publicBase}${path}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label ?? "קישור אישי לטופס זמינות"}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-xs text-brown-500">
          העובד פותח את הקישור, ממלא משמרות, ושולח. אין צורך בסיסמה.
        </p>

        {publicUrl ? (
          <Section
            title="🌍 קישור ציבורי"
            description="ניתן לשליחה בוואטסאפ — עובד מכל מקום וכל מכשיר."
            tone="success"
          >
            <CopyableLink url={publicUrl} />
          </Section>
        ) : ctx.isLocalhost ? (
          <Section
            title="💻 קישור מקומי (לבדיקה במחשב הזה בלבד)"
            description="עובד רק עם דפדפן שמופעל באותו מחשב שבו רץ השרת."
            tone="warning"
          >
            <CopyableLink url={localUrl} />
          </Section>
        ) : null}

        {lanUrls.length > 0 && (
          <Section
            title="📡 קישור רשת מקומית (אותו WiFi)"
            description="עובד עבור מכשירים באותה רשת אלחוטית — טוב לבדיקה מהנייד."
            tone="info"
          >
            <div className="space-y-2">
              {lanUrls.map((u) => (
                <CopyableLink key={u} url={u} />
              ))}
            </div>
          </Section>
        )}

        {!publicUrl && (
          <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-xs text-brown-600">
            <div className="mb-1 font-semibold text-brown-900">
              איך להפעיל את הקישור עבור כולם?
            </div>
            <ul className="list-disc space-y-0.5 ps-5">
              <li>
                <strong>פריסה חינמית ב-Vercel:</strong>{" "}
                <a
                  href="https://vercel.com/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline"
                  dir="ltr"
                >
                  vercel.com/new
                </a>{" "}
                — מקבלים URL כמו{" "}
                <code className="rounded bg-white px-1 py-0.5 num">https://your-app.vercel.app</code>
              </li>
              <li>
                <strong>פריסה ב-Railway / Render / Fly.io</strong> — בחירה
                דומה, גם תומכים ב-Next.js.
              </li>
              <li>
                <strong>תוננל זמני (לבדיקה מהירה):</strong>{" "}
                <code className="rounded bg-white px-1 py-0.5" dir="ltr">
                  npx cloudflared tunnel --url http://localhost:3000
                </code>
              </li>
              <li>
                לאחר הפריסה: הוסיפו{" "}
                <code className="rounded bg-white px-1 py-0.5" dir="ltr">
                  PUBLIC_URL=https://your-app.vercel.app
                </code>{" "}
                כמשתנה סביבה כדי שהקישורים בעמוד הזה יוצגו נכון.
              </li>
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Section({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description: string;
  tone: "success" | "warning" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/40"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/40"
        : "border-brand-200 bg-brand-50/40";
  return (
    <div className={`rounded-xl border ${cls} p-3`}>
      <div className="text-sm font-semibold text-brown-900">{title}</div>
      <p className="mb-2 text-xs text-brown-600">{description}</p>
      {children}
    </div>
  );
}
