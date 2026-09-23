import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/supabase/auth"
import { ProductionAssignments } from "@/components/production-assignments"

export default async function ProductionSettings() {
    if (!await isAdmin()) redirect("/")
    return <ProductionAssignments />
}
