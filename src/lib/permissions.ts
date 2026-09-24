import type { UserRole } from "@/types/database"

export const isProductionOperator = (role: string | null | undefined) => role === "department_operator"
export const isInstaller = (role: string | null | undefined) => role === "installer"
export const isMobileAdmin = (role: string | null | undefined) => role === "mobile_admin"
export const isStaffAdmin = (role: string | null | undefined) => role === "super_admin" || role === "rodier_admin"
export const homeForRole = (role: UserRole | string | null) => isProductionOperator(role) ? "/production" : isInstaller(role) || isMobileAdmin(role) ? "/profile" : "/"

/** Default-deny route surface for department operators; data authorization lives in Postgres. */
export function canOpenRoute(role: string | null | undefined, path: string) {
    if (!role) return false
    if (isInstaller(role) || isMobileAdmin(role)) return path === "/profile" || path === "/reset-password" || path === "/login" || path === "/forgot-password"
    if (!isProductionOperator(role)) return true
    return path === "/production" || path === "/profile" || path === "/reset-password"
        || path === "/login" || path === "/forgot-password"
        || path === "/sw.js" || path === "/manifest.webmanifest"
}
