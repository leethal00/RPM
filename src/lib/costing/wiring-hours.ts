export const WIRING_MODULES_PER_HOUR = 25

export function wiringHours(moduleCount: number): number {
    return moduleCount / WIRING_MODULES_PER_HOUR
}
