export const SIDEBAR_WIDTH_STORAGE_KEY = "rpm-sidebar-width"
export const DEFAULT_SIDEBAR_WIDTH = 256
export const MIN_SIDEBAR_WIDTH = 200
export const MAX_SIDEBAR_WIDTH = 400

export function clampSidebarWidth(width: number) {
    return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}
