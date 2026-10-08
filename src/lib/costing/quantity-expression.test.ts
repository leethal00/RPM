import { describe, expect, it } from "vitest"
import { parseQuantityExpression } from "./quantity-expression"

describe("parseQuantityExpression", () => {
    it("calculates multiplication with x or *", () => {
        expect(parseQuantityExpression("4x4")).toBe(16)
        expect(parseQuantityExpression("4 × 4")).toBe(16)
        expect(parseQuantityExpression("4*4")).toBe(16)
    })

    it("supports Excel-style equals, parentheses, and order of operations", () => {
        expect(parseQuantityExpression("=2+3*4")).toBe(14)
        expect(parseQuantityExpression("(2+3)*4")).toBe(20)
        expect(parseQuantityExpression("10/2-1")).toBe(4)
    })

    it("supports decimals and negative values without floating-point tails", () => {
        expect(parseQuantityExpression(".1 + .2")).toBe(0.3)
        expect(parseQuantityExpression("-2x1.5")).toBe(-3)
    })

    it("rejects malformed or unsafe input", () => {
        for (const input of ["", "4x", "2/0", "1+foo", "2**3", "1;alert(1)", "(2+3"]) {
            expect(parseQuantityExpression(input)).toBeNull()
        }
    })
})
