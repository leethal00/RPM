import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ role: vi.fn() }))
vi.mock("@/lib/supabase/auth", () => ({ getUserRole: mocks.role }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))
vi.mock("@/components/production/production-planning", () => ({ ProductionPlanning: () => null }))
import Page from "./page"

beforeEach(() => vi.clearAllMocks())
describe("production planning route", () => {
    it("requires sign-in", async () => {
        mocks.role.mockResolvedValue(null)
        await expect(Page()).rejects.toThrow("redirect:/login")
    })
    it.each(["client_hq", "client_store", "technician", "department_operator"])("denies direct navigation for %s", async role => {
        mocks.role.mockResolvedValue({ role })
        await expect(Page()).rejects.toThrow("redirect:/profile")
    })
    it.each(["super_admin", "rodier_admin"])("allows %s", async role => {
        mocks.role.mockResolvedValue({ role })
        await expect(Page()).resolves.toBeTruthy()
    })
})
