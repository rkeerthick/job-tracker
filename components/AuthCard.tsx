import { Card } from "@/components/ui/Card";

/** Shared centered layout for /login and /signup: app name, title, card, footer link. */
export function AuthCard({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <p className="text-sm font-medium text-muted">Job Tracker</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>

        <Card className="p-6">{children}</Card>

        {footer && <p className="text-center text-sm text-muted">{footer}</p>}
      </div>
    </main>
  );
}
