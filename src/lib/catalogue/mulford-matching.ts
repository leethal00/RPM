type CatalogueMaterial = {
    id: string
    description: string
    subsection?: string | null
}

function normalise(value: string) {
    return value.toLowerCase()
        .replace(/signbond/g, "signbond")
        .replace(/service coat/g, "service")
        .replace(/white\s+or\s+black/g, "white black")
        .replace(/white\s*\/\s*black/g, "white black")
        .replace(/coloured/g, "colour")
        .replace(/uv 2 sides/g, "")
        .replace(/\bthick\b/g, "")
        .replace(/[^a-z0-9.]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function number(value: string | undefined) {
    if (!value) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function sheetSize(value: string) {
    const matches = Array.from(value.matchAll(/\b(\d{3,4})\s*x\s*(\d{3,4})(?:\s*x\s*(\d+(?:\.\d+)?))?\b/gi))
    const match = matches.at(-1)
    if (!match) return null
    return { a: Number(match[1]), b: Number(match[2]), trailingGauge: number(match[3]) }
}

function sourceGauge(value: string) {
    return number(value.match(/\bGauge:\s*(\d+(?:\.\d+)?)\s*mm\b/i)?.[1])
}

function existingGauge(value: string) {
    return sheetSize(value)?.trailingGauge ?? number(value.match(/\b(\d+(?:\.\d+)?)\s*mm\b/i)?.[1]) ?? null
}

function sourceColour(value: string) {
    return normalise(value.match(/\b(?:Colour|Color):\s*([^|]+)/i)?.[1] ?? "")
}

function hasSameColour(source: string, existing: string) {
    const expected = sourceColour(source)
    const candidate = normalise(existing)
    if (!expected) return false
    if (expected === "other colours") return candidate.includes("acrylic colour")
    if (expected === "clear 30 year warranty") return candidate.includes("acrylic clear")
    if (expected === "clear") return candidate.includes("clear")
    if (expected === "opal") return candidate.includes("opal") && !candidate.includes("led opal")
    if (expected === "led opal") return candidate.includes("led opal")
    if (expected === "white black") return candidate.includes("white black")
    return expected.split(" ").every((token) => candidate.includes(token))
}

function sameSize(source: string, existing: string) {
    const left = sheetSize(normalise(source))
    const right = sheetSize(normalise(existing))
    return Boolean(left && right && left.a === right.a && left.b === right.b)
}

function sameGauge(source: string, existing: string) {
    const left = sourceGauge(source)
    const right = existingGauge(normalise(existing))
    return left != null && right != null && left === right
}

function colourSignature(value: string) {
    const ignored = new Set(["acm", "signbond", "service", "coat", "internal", "use"])
    return normalise(value).split(" ").filter((token) => token && !ignored.has(token) && !/^\d/.test(token)).sort().join(" ")
}

function sourceField(value: string, label: string) {
    return value.match(new RegExp(`\\b${label}:\\s*([^|]+)`, "i"))?.[1]?.trim() ?? ""
}

function existingAcmColour(value: string) {
    return value
        .replace(/^ACM\s+Signbond\s+/i, "")
        .replace(/\b\d{3,4}\s*x\s*\d{3,4}(?:\s*x\s*\d+(?:\.\d+)?)?.*$/i, "")
        .trim()
}

function sameSkin(source: string, existing: string) {
    const sourceValues = sourceField(source, "Skin").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
    const existingValue = number(existing.match(/\b(\d+(?:\.\d+)?)\s*mm\s*skin\b/i)?.[1])
    if (sourceValues.length === 0 || existingValue == null) return false
    return sourceValues.every((value) => value === existingValue)
}

/**
 * Return a match only when all Mulford variant dimensions agree. The caller may
 * safely mark a unique result ready; weak/fuzzy matches stay in the review flow.
 */
export function findExactMulfordMatch<T extends CatalogueMaterial>(description: string, pool: T[]): T | null {
    const source = normalise(description)
    if (/cts per m2|\beach$/.test(source)) return null

    const candidates = pool.filter((material) => {
        const existing = normalise(`${material.description} ${material.subsection ?? ""}`)

        if (source.includes("general purpose cast") && source.includes("acrylic")) {
            return existing.includes("acrylic") && hasSameColour(description, material.description) && sameGauge(description, material.description) && sameSize(description, material.description)
        }

        if (source.includes("signbond fabrication") || source.includes("signbond feve") || source.includes("signbond specialty")) {
            const family = source.includes("fabrication") ? "fabrication" : source.includes("feve") ? "feve" : "specialty"
            const sourceAcmColour = sourceField(description, "Colou?r")
            return existing.includes(family) &&
                sameGauge(description, material.description) &&
                sameSize(description, material.description) &&
                sameSkin(description, material.description) &&
                colourSignature(sourceAcmColour) === colourSignature(existingAcmColour(material.description))
        }

        if (source.includes("signex integral foam pvc")) {
            return existing.includes("signex") && sameGauge(description, material.description) && sameSize(description, material.description)
        }

        if (source.includes("polycarbonate") && source.includes("general purpose") && sourceColour(description) === "clear") {
            return existing.includes("polycarbonate clear") && sameGauge(description, material.description) && sameSize(description, material.description)
        }

        return false
    })

    return candidates.length === 1 ? candidates[0] : null
}
