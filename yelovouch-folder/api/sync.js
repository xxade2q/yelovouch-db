const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Parse body if needed (Vercel auto-parses JSON)
    const { user, repo, content, sha } = req.body || {};

    // Validate
    if (!user || !repo) {
        return res.status(400).json({ 
            error: 'Missing user or repo',
            received: { user, repo }
        });
    }

    if (!content || typeof content !== 'string') {
        return res.status(400).json({ 
            error: 'Content must be a base64 string',
            type: typeof content
        });
    }

    // Get token from environment
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        return res.status(500).json({ 
            error: 'GITHUB_TOKEN not found in environment variables',
            fix: 'Add GITHUB_TOKEN to Vercel project settings'
        });
    }

    try {
        // Build GitHub API URL
        const apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/db.json`;
        
        // Build payload
        const payload = {
            message: `Update vouches - ${new Date().toISOString()}`,
            content: content
        };
        
        // Only add sha if it exists and is non-empty
        if (sha && typeof sha === 'string' && sha.length > 0) {
            payload.sha = sha;
        }

        // Make the request to GitHub
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'YeloVouch-Sync/1.0',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload)
        });

        // Parse response
        const data = await response.json();

        // Handle success
        if (response.ok) {
            return res.status(200).json({
                success: true,
                sha: data.content?.sha || null,
                message: 'Sync successful'
            });
        }

        // Handle errors
        let errorMsg = data.message || 'GitHub API error';
        let fixHint = '';

        if (response.status === 422) {
            if (errorMsg.includes('sha')) {
                errorMsg = 'SHA mismatch — provide correct SHA or omit for new file';
                fixHint = 'Send sha: undefined (not null, not empty string) when creating new file';
            } else {
                errorMsg = 'Invalid content — ensure JSON is valid and base64 encoded';
                fixHint = 'Check that content is valid base64 without line breaks';
            }
        } else if (response.status === 401) {
            errorMsg = 'Invalid GitHub token';
            fixHint = 'Regenerate token with repo:contents scope';
        } else if (response.status === 404) {
            errorMsg = 'Repository or file not found';
            fixHint = 'Verify repo name and user. If db.json doesn\'t exist, omit sha';
        } else if (response.status === 403) {
            errorMsg = 'Rate limit exceeded or insufficient permissions';
            fixHint = 'Wait 60 minutes or check token scopes';
        }

        return res.status(response.status).json({
            error: errorMsg,
            fix_hint: fixHint,
            github_status: response.status,
            details: data
        });

    } catch (err) {
        // Network or timeout error
        return res.status(500).json({
            error: 'Internal server error',
            message: err.message,
            fix: 'Check Vercel logs for stack trace'
        });
    }
};
