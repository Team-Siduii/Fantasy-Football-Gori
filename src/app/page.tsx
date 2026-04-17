import { redirect } from "next/navigation";
import { isAuthenticatedSession } from "@/lib/auth-session";

export default async function HomePage() {
  if (await isAuthenticatedSession()) {
    redirect("/manager/my-team");
  }

  redirect("/login");
}
