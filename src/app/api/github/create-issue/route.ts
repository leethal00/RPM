import { NextRequest, NextResponse } from "next/server"

const GITHUB_REPO_OWNER = "leethal00"
const GITHUB_REPO_NAME = "RPM"

export async function POST(request: NextRequest) {
  try {
    const { title, description, priority, aiAutoBuild } = await request.json()

    // Validate required fields
    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required" },
        { status: 400 }
      )
    }

    // Get GitHub token from environment
    const githubToken = process.env.GITHUB_TOKEN

    if (!githubToken) {
      console.error("GITHUB_TOKEN environment variable is not set")
      return NextResponse.json(
        { error: "GitHub integration is not configured. Please contact your administrator." },
        { status: 500 }
      )
    }

    // Map priority to label
    const priorityLabels: Record<string, string> = {
      low: "priority: low",
      medium: "priority: medium",
      high: "priority: high",
    }

    const priorityLabel = priorityLabels[priority] || "priority: medium"

    // Build labels array based on aiAutoBuild setting
    const labels = [priorityLabel]
    if (aiAutoBuild) {
      labels.push("ai-feature")
    }

    // Format the issue body
    const issueBody = `## Feature Request

${description}

---

**Priority:** ${priority.toUpperCase()}
**AI Auto-Build:** ${aiAutoBuild ? "✅ Enabled" : "❌ Disabled"}

*This feature request was submitted via the RPM Feature Request form.*
`

    // Create GitHub issue
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error("GitHub API error:", errorData)

      if (response.status === 401) {
        return NextResponse.json(
          { error: "GitHub authentication failed. Please check the token configuration." },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: errorData.message || "Failed to create GitHub issue" },
        { status: response.status }
      )
    }

    const issueData = await response.json()

    return NextResponse.json({
      success: true,
      issue_number: issueData.number,
      html_url: issueData.html_url,
      message: "Feature request created successfully",
    })
  } catch (error: any) {
    console.error("Error creating GitHub issue:", error)
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
