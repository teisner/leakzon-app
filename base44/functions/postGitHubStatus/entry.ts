import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const { project_id, activity_type, title, description } = await req.json();
    if (!activity_type) {
      return Response.json({ error: "activity_type is required" }, { status: 400 });
    }

    const repoOwner = Deno.env.get("GITHUB_REPO_OWNER");
    const repoName = Deno.env.get("GITHUB_REPO_NAME");
    const branch = Deno.env.get("GITHUB_REPO_BRANCH") || "main";

    if (!repoOwner || !repoName) {
      return Response.json(
        { error: "GITHUB_REPO_OWNER and GITHUB_REPO_NAME must be set in dashboard environment variables" },
        { status: 500 }
      );
    }

    // Get the GitHub OAuth access token from the shared connector
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");

    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // Resolve the latest commit SHA on the target branch
    const branchRes = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/branches/${encodeURIComponent(branch)}`,
      { headers }
    );
    if (!branchRes.ok) {
      const errText = await branchRes.text();
      return Response.json(
        { error: `Failed to fetch branch '${branch}': ${errText}` },
        { status: 502 }
      );
    }
    const branchData = await branchRes.json();
    const sha = branchData.commit?.sha;
    if (!sha) {
      return Response.json({ error: "Could not resolve commit SHA from branch" }, { status: 500 });
    }

    // Look up project name for a human-readable description
    let projectName = "";
    if (project_id) {
      try {
        const project = await base44.asServiceRole.entities.Project.get(project_id);
        projectName = project?.name || "";
      } catch {}
    }

    // Build the status description (GitHub max is 140 chars)
    let statusDesc = title || activity_type;
    if (projectName) statusDesc += ` — ${projectName}`;
    if (description) statusDesc += `: ${description}`;
    statusDesc = statusDesc.slice(0, 140);

    // Post the commit status
    const statusRes = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/statuses/${sha}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "success",
          description: statusDesc,
          context: `leakzon/onboarding/${activity_type}`,
        }),
      }
    );
    if (!statusRes.ok) {
      const errText = await statusRes.text();
      return Response.json(
        { error: `Failed to post commit status: ${errText}` },
        { status: 502 }
      );
    }

    const statusData = await statusRes.json();
    return Response.json({
      success: true,
      sha,
      status_id: statusData.id,
      html_url: statusData.html_url,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});