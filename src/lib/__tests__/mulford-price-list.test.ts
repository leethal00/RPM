import { describe, expect, it } from "vitest"
import { parseMulfordPages } from "@/lib/catalogue/mulford-price-list"
import { findExactMulfordMatch } from "@/lib/catalogue/mulford-matching"

describe("Mulford price list extraction", () => {
    it("emits one catalogue candidate per price column with inherited row attributes", () => {
        const records = parseMulfordPages([{
            pageNumber: 3,
            items: [
                { text: "ACRYLIC", x: 51, y: 737 },
                { text: "GENERAL PURPOSE CAST", x: 51, y: 705 },
                { text: "Colour", x: 51, y: 689 },
                { text: "Gauge", x: 178, y: 689 },
                { text: "2440 x 1220", x: 240, y: 689 },
                { text: "2490 x 1880", x: 311, y: 689 },
                { text: "CTS Per m2", x: 453, y: 689 },
                { text: "Clear (30 Year Warranty)", x: 51, y: 672 },
                { text: "3.0 mm", x: 178, y: 672 },
                { text: "$93.50", x: 250, y: 672 },
                { text: "$166.35", x: 320, y: 672 },
                { text: "$47.07", x: 463, y: 672 },
                { text: "4.5 mm", x: 178, y: 655 },
                { text: "$140.25", x: 248, y: 655 },
            ],
        }])

        expect(records).toHaveLength(4)
        expect(records[0]).toMatchObject({
            description: "Acrylic | General Purpose Cast | Colour: Clear (30 Year Warranty) | Gauge: 3.0 mm | 2440 x 1220",
            price: "93.50",
        })
        expect(records[3]).toMatchObject({
            description: "Acrylic | General Purpose Cast | Colour: Clear (30 Year Warranty) | Gauge: 4.5 mm | 2440 x 1220",
            price: "140.25",
        })
        expect(new Set(records.map((record) => record.__row)).size).toBe(4)
    })

    it("matches only a unique Mulford variant with the same family, colour, gauge and sheet size", () => {
        const pool = [
            { id: "three", description: "Acrylic Clear 3mm thick 2440x1220", subsection: "Acrylic Opal and Clear" },
            { id: "four-five", description: "Acrylic Clear 4.5mm thick 2440x1220", subsection: "Acrylic Opal and Clear" },
        ]

        expect(findExactMulfordMatch(
            "Acrylic | General Purpose Cast | Colour: Clear (30 Year Warranty) | Gauge: 3.0 mm | 2440 x 1220",
            pool,
        )?.id).toBe("three")
        expect(findExactMulfordMatch(
            "Acrylic | General Purpose Cast | Colour: Clear (30 Year Warranty) | Gauge: 6.0 mm | 2440 x 1220",
            pool,
        )).toBeNull()
        expect(findExactMulfordMatch(
            "Acrylic | General Purpose Cast | Colour: Clear (30 Year Warranty) | Gauge: 3.0 mm | CTS Per m2",
            pool,
        )).toBeNull()
    })

    it("matches ACM variants only when finish, gauge, skin and sheet size agree", () => {
        const pool = [
            { id: "service", description: "ACM Signbond Gloss White / Service 2440x1220x4, 0.3mm skin", subsection: "ACM - Fabrication grade" },
            { id: "black", description: "ACM Signbond Gloss White / Gloss Black 2440x1220x4, 0.3mm skin", subsection: "ACM - Fabrication grade" },
        ]
        expect(findExactMulfordMatch(
            "Aluminum Composite Panel | SignbonD Fabrication | Colour: Gloss White / Service Coat | Gauge: 4.0 mm | Skin: 0.3/0.3 | 2440 x 1220",
            pool,
        )?.id).toBe("service")
        expect(findExactMulfordMatch(
            "Aluminum Composite Panel | SignbonD Fabrication | Colour: Gloss White / Service Coat | Gauge: 4.0 mm | Skin: 0.21/0.21 | 2440 x 1220",
            pool,
        )).toBeNull()
    })

    it("keeps wrapped colour fragments with the priced row and carries category across pages", () => {
        const records = parseMulfordPages([
            {
                pageNumber: 5,
                items: [{ text: "ALUMINUM COMPOSITE PANEL", x: 51, y: 760 }],
            },
            {
                pageNumber: 6,
                items: [
                    { text: "SignbonD SPECIALTY", x: 51, y: 737 },
                    { text: "Colour", x: 51, y: 721 },
                    { text: "Gauge", x: 187, y: 721 },
                    { text: "Skin", x: 263, y: 721 },
                    { text: "2440 x 1220", x: 319, y: 721 },
                    { text: "Whiteboard Steel Gloss", x: 51, y: 705 },
                    { text: "3.0 mm", x: 186, y: 700 },
                    { text: "0.3/0.3", x: 257, y: 700 },
                    { text: "$146.32", x: 328, y: 700 },
                    { text: "White / Service Coat", x: 51, y: 695 },
                ],
            },
        ])

        expect(records[0].description).toBe("Aluminum Composite Panel | SignbonD Specialty | Colour: Whiteboard Steel Gloss White / Service Coat | Gauge: 3.0 mm | Skin: 0.3/0.3 | 2440 x 1220")
    })
})
