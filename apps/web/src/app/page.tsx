import { redirect } from "next/navigation";
import { can } from "@mozes/authz";
import { getCurrentUser } from "@/server/actor";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(can(user.actor, "studio.access") ? "/studio" : "/learn");
}
