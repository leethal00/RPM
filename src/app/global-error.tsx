"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h2 style={{ marginTop: "1rem", fontSize: "1.5rem", fontWeight: "bold" }}>Something went wrong</h2>
            <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              style={{ marginTop: "1.5rem", padding: "0.5rem 1rem", borderRadius: "0.375rem", backgroundColor: "#2D6A4F", color: "white", border: "none", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
