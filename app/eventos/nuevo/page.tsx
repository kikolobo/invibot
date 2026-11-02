import { requireOrg } from "@/lib/auth/session";
import { StepOne } from "./wizard";

export const metadata = { title: "Nuevo evento" };

/** Step one, before the event exists. The rest live at /eventos/nuevo/[id]. */
export default async function NuevoEvento() {
  const { name } = await requireOrg();
  return <StepOne firstName={name?.trim().split(/\s+/)[0] || null} />;
}
