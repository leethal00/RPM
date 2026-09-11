self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", () => {
  // Network requests intentionally pass through unchanged for now.
  // Offline caching can be added once the installer workflow is defined.
})
