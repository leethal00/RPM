import { NextRequest, NextResponse } from "next/server"

const GITHUB_REPO_OWNER = "leethal00"
const GITHUB_REPO_NAME = "RPM"

export async function GET(request: NextRequest) {
  try {
    const githubToken = process.env.GITHUB_TOKEN

    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub integration is not configured" },
        { status: 500 }
      )
    }

    // Fetch issues with ai-feature label
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues?labels=ai-feature&state=all&sort=created&direction=desc`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error("GitHub API error:", errorData)
      return NextResponse.json(
        { error: "Failed to fetch feature requests" },
        { status: response.status }
      )
    }

    const issues = await response.json()

    // Transform issues to include useful metadata
    const featureRequests = issues.map((issue: any) => ({
      id: issue.number,
      title: issue.title,
      description: issue.body,
      state: issue.state, // open or closed
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      user: {
        login: issue.user.login,
        avatar_url: issue.user.avatar_url,
      },
      labels: issue.labels.map((label: any) => ({
        name: label.name,
        color: label.color,
      })),
      html_url: issue.html_url,
      comments: issue.comments,
      pull_request: issue.pull_request ? true : false,
    }))

    return NextResponse.json({
      success: true,
      feature_requests: featureRequests,
      total: featureRequests.length,
    })
  } catch (error: any) {
    console.error("Error fetching GitHub issues:", error)
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
