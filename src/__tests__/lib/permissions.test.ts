import { describe, expect, it } from "vitest"
import { canOpenRoute, homeForRole } from "@/lib/permissions"

describe("department operator access", () => {
    it("lands in production", () => expect(homeForRole("department_operator")).toBe("/production"))
    it.each(["/", "/leads", "/quoting", "/quoting/jobs/123", "/quoting/catalogue", "/settings/users", "/settings/production", "/analysis", "/tasks", "/api/xero/import-job", "/api/xero/callback", "/api/xero/webhook", "/production/admin", "/production-other", "/profile/admin"])("denies %s", path => {
        expect(canOpenRoute("department_operator",path)).toBe(false)
    })
    it.each(["/production","/profile","/reset-password","/login","/forgot-password"])("allows %s", path=> {
        expect(canOpenRoute("department_operator",path)).toBe(true)
    })
    it("fails closed without a profile",()=>expect(canOpenRoute(null,"/production")).toBe(false))
    it("preserves administrator routes",()=>expect(canOpenRoute("super_admin","/settings/production")).toBe(true))
})
