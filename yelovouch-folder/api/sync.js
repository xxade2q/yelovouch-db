const fetch = require('node-fetch'); // v2.x

module.exports = async (req, res) => {
    // CORS headers — minimal but complete
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { user, repo, content, sha } = req.body;
        const token = process.env.GITHUB_TOKEN;

        // VALIDATION: token and content
        if (!token) {
            return res.status(500).json({ error: 'GITHUB_TOKEN not set in Vercel env' });
        }
        if (!content) {
            return res.status(400).json({ error: 'Missing content (base64 string)' });
        }
        if (!user || !repo) {
            return res.status(400).json({ error: 'Missing user/repo' });
        }

        // STEP B1: Build API URL
        const apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/db.json`;

        // STEP B2: Prepare payload — content MUST be base64
        const payload = {
            message: 'Update vouch database ledger via secure console',
            content: content,  // client must send base64-encoded JSON
            sha: sha || undefined  // if undefined, GitHub creates new file
        };

        // STEP B3: Execute PUT
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Vercel-Server-Gateway/1.0'
            },
            body: JSON.stringify(payload)
        });

        // STEP B4: Parse response
        const data = await response.json();

        if (response.ok) {
            // Return new SHA for subsequent updates
            return res.status(200).json({ 
                success: true, 
                sha: data.content.sha,
                commit: data.commit.sha
            });
        } else {
            // STEP B5: Detailed error mapping
            let errorMsg = data.message || 'GitHub API error';
            if (response.status === 422 && data.message.includes('sha')) {
                errorMsg = 'SHA mismatch — file exists but sha not provided or incorrect. Get current sha via GET first.';
            } else if (response.status === 404) {
                errorMsg = 'Repo or file not found — check user/repo and permissions.';
            } else if (response.status === 401) {
                errorMsg = 'Invalid GITHUB_TOKEN — regenerate and redeploy.';
            }
            return res.status(response.status).json({ error: errorMsg, details: data });
        }

    } catch (err) {
        // STEP B6: Catch network/timeout errors
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: err.message,
            hint: 'Check Vercel logs for stack trace'
        });
    }
};
