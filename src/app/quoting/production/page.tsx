import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/supabase/auth"
import { canManagePlanning } from "@/lib/production/planning"
import { ProductionPlanning } from "@/components/production/production-planning"

export default async function ProductionPlanningPage() {
    const actor = await getUserRole()
    if (!actor) redirect("/login")
    if (!canManagePlanning(actor.role)) redirect("/profile")
    return <ProductionPlanning />
}
