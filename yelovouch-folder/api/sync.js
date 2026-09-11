export default async function handler(req, res) {
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
        const { user, repo, content, sha } = req.body || {};

        const token = process.env.GITHUB_TOKEN;

        if (!token) {
            return res.status(500).json({
                error: 'GITHUB_TOKEN is missing in Vercel Environment Variables'
            });
        }

        if (!user || !repo || !content) {
            return res.status(400).json({
                error: 'Missing user, repo, or content'
            });
        }

        const githubUrl =
            `https://api.github.com/repos/${user}/${repo}/contents/db.json`;

        let currentSha = sha || null;

        /*
         * Get the current SHA if the frontend doesn't have one.
         */
        if (!currentSha) {
            const existingResponse = await fetch(githubUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            if (existingResponse.ok) {
                const existingData = await existingResponse.json();
                currentSha = existingData.sha;
            } else if (existingResponse.status !== 404) {
                const errorData = await existingResponse.json().catch(() => ({}));

                return res.status(existingResponse.status).json({
                    error: errorData.message || 'Unable to read db.json from GitHub'
                });
            }
        }

        const githubBody = {
            message: 'Update vouches database',
            content: content
        };

        if (currentSha) {
            githubBody.sha = currentSha;
        }

        const githubResponse = await fetch(githubUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify(githubBody)
        });

        const githubData = await githubResponse.json().catch(() => ({}));

        if (!githubResponse.ok) {
            console.error('GitHub API error:', githubData);

            return res.status(githubResponse.status).json({
                error: githubData.message || 'GitHub API request failed',
                status: githubResponse.status
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Database synced successfully',
            sha: githubData.content?.sha || null
        });

    } catch (error) {
        console.error('Server error:', error);

        return res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
}
