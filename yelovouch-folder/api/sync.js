export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed'
        });
    }

    try {
        const { user, repo, content, sha } = req.body;

        const token = process.env.GITHUB_TOKEN;

        if (!token) {
            return res.status(500).json({
                error: 'GITHUB_TOKEN is not configured in Vercel'
            });
        }

        if (!user || !repo || !content) {
            return res.status(400).json({
                error: 'Missing user, repo, or content'
            });
        }

        const url = `https://api.github.com/repos/${user}/${repo}/contents/db.json`;

        let currentSha = sha;

        // If frontend doesn't have SHA, get the current SHA from GitHub
        if (!currentSha) {
            const check = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            if (check.ok) {
                const existing = await check.json();
                currentSha = existing.sha;
            }
        }

        const body = {
            message: 'Update vouches database',
            content: content
        };

        if (currentSha) {
            body.sha = currentSha;
        }

        const githubResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify(body)
        });

        const data = await githubResponse.json();

        if (!githubResponse.ok) {
            console.error('GitHub error:', data);

            return res.status(githubResponse.status).json({
                error: data.message || 'GitHub API error',
                githubStatus: githubResponse.status
            });
        }

        return res.status(200).json({
            success: true,
            sha: data.content?.sha
        });

    } catch (error) {
        console.error('Server error:', error);

        return res.status(500).json({
            error: error.message
        });
    }
}
