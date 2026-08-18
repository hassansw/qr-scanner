import { notFound } from "next/navigation";
import VisitorRegister from "@/components/VisitorRegister";
import { extractSessionUuid } from "@/lib/qr";

export default async function RegisterPage({
  params,
}: PageProps<"/register/[sessionUuid]">) {
  const { sessionUuid } = await params;
  const uuid = extractSessionUuid(decodeURIComponent(sessionUuid));
  if (!uuid) notFound();

  return (
    <main className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <VisitorRegister sessionUuid={uuid} />
    </main>
  );
}
