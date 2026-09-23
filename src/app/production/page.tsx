import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/supabase/auth"
import { isProductionOperator, isStaffAdmin } from "@/lib/permissions"
import { ProductionWorkspace } from "@/components/production-workspace"

export default async function ProductionPage() {
    const user = await getUserRole()
    if (!user) redirect("/login")
    if (!isProductionOperator(user.role) && !isStaffAdmin(user.role)) redirect("/")
    return <ProductionWorkspace />
}
