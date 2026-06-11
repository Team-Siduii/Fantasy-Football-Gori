import { redirect } from "next/navigation";
import { getAuthenticatedEmail } from "@/lib/auth-session";
import { resolvePreferredManagerRoute } from "@/lib/manager-entry-route";

export const dynamic = "force-dynamic";

export default async function ManagerIndexPage() {
  const email = await getAuthenticatedEmail();
  redirect(email ? await resolvePreferredManagerRoute(email) : "/manager/my-team");
}
