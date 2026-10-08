// Arithmetic for quantity inputs. Only numbers and arithmetic operators are accepted.
export function parseQuantityExpression(input: string): number | null {
    const source = input.trim().replace(/^=/, "").trim()
    if (!source || source.length > 120) return null

    let pos = 0
    const skipSpaces = () => {
        while (/\s/.test(source[pos] ?? "")) pos++
    }
    const parseNumber = (): number => {
        skipSpaces()
        const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(pos))
        if (!match) throw new Error("Expected number")
        pos += match[0].length
        return Number(match[0])
    }
    const parseFactor = (): number => {
        skipSpaces()
        const char = source[pos]
        if (char === "+" || char === "-") {
            pos++
            const value = parseFactor()
            return char === "-" ? -value : value
        }
        if (char === "(") {
            pos++
            const value = parseSum()
            skipSpaces()
            if (source[pos] !== ")") throw new Error("Missing closing bracket")
            pos++
            return value
        }
        return parseNumber()
    }
    const parseProduct = (): number => {
        let value = parseFactor()
        for (;;) {
            skipSpaces()
            const char = source[pos]
            if (!char || !"*xX×/÷".includes(char)) return value
            pos++
            const next = parseFactor()
            value = "*/xX×".includes(char) && char !== "/" ? value * next : value / next
        }
    }
    const parseSum = (): number => {
        let value = parseProduct()
        for (;;) {
            skipSpaces()
            const char = source[pos]
            if (char !== "+" && char !== "-") return value
            pos++
            const next = parseProduct()
            value = char === "+" ? value + next : value - next
        }
    }

    try {
        const value = parseSum()
        skipSpaces()
        if (pos !== source.length || !Number.isFinite(value)) return null
        return Number(value.toPrecision(15))
    } catch {
        return null
    }
}
