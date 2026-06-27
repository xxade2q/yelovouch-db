const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // CORS — strict but permissive
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Validate body
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    const { user, repo, content, sha } = req.body;
    const token = process.env.GITHUB_TOKEN;

    // Comprehensive validation
    if (!token) {
        return res.status(500).json({ 
            error: 'GITHUB_TOKEN environment variable is not set',
            fix: 'Add GITHUB_TOKEN in Vercel project settings → Environment Variables'
        });
    }

    if (!user || !repo) {
        return res.status(400).json({ error: 'Missing user or repo in request body' });
    }

    if (!content || typeof content !== 'string' || content.length < 10) {
        return res.status(400).json({ 
            error: 'Invalid content — must be base64 string of at least 10 chars',
            received: typeof content
        });
    }

    // Validate base64 format (basic check)
    try {
        Buffer.from(content, 'base64').toString('utf-8');
    } catch (e) {
        return res.status(400).json({ error: 'Content is not valid base64 encoding' });
    }

    try {
        // Construct GitHub API URL
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contents/db.json`;
        
        // Build payload — SHA handling: if sha is null/undefined/empty, omit
        const payload = {
            message: `Update vouch database - ${new Date().toISOString()}`,
            content: content,
            committer: {
                name: 'YeloVouch Bot',
                email: 'bot@yelovouch.local'
            }
        };
        
        // Only include sha if it's a non-empty string (existing file update)
        if (sha && typeof sha === 'string' && sha.length > 0) {
            payload.sha = sha;
        }

        // Execute PUT with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'YeloVouch-Server/1.0 (Vercel)',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        // Parse response
        const data = await response.json();

        // Handle success
        if (response.ok) {
            return res.status(200).json({
                success: true,
                sha: data.content?.sha || null,
                commitSha: data.commit?.sha || null,
                message: 'File updated successfully'
            });
        }

        // Handle specific GitHub errors
        let userMessage = 'GitHub API error';
        let statusCode = response.status;

        if (response.status === 422) {
            if (data.message && data.message.includes('sha')) {
                userMessage = 'SHA mismatch — file exists but SHA is missing or incorrect. ' +
                             'This happens when the file was created without providing SHA. ' +
                             'Solution: Get current SHA via GET /contents/db.json first.';
            } else {
                userMessage = 'Unprocessable entity — check file content format (must be valid JSON base64).';
            }
        } else if (response.status === 404) {
            userMessage = 'Repository or file not found. Verify repo name, user, and that ' +
                          'db.json exists. If first upload, omit SHA.';
        } else if (response.status === 401) {
            userMessage = 'GitHub token invalid or expired. Regenerate token with repo scope ' +
                          'and update Vercel environment variable.';
        } else if (response.status === 403) {
            userMessage = 'Rate limit exceeded or insufficient permissions. ' +
                          'Check token scope (needs repo:status and repo:contents).';
        } else if (response.status === 409) {
            userMessage = 'Git conflict — file was modified remotely. ' +
                          'Fetch latest SHA first, then retry.';
        }

        return res.status(statusCode).json({
            error: userMessage,
            github_status: response.status,
            github_message: data.message || 'No additional details',
            fix_hint: 'See documentation for step-by-step resolution'
        });

    } catch (err) {
        // Handle network/timeout errors
        let errorMsg = err.message;
        let statusCode = 500;
        let fixHint = '';

        if (err.name === 'AbortError') {
            errorMsg = 'Request timed out after 15 seconds — GitHub API may be slow or unreachable.';
            fixHint = 'Check Vercel network logs and GitHub status page.';
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            errorMsg = 'Network error — cannot reach GitHub API.';
            fixHint = 'Verify Vercel has outbound internet access and no firewall blocks.';
        } else if (err.message.includes('JSON')) {
            errorMsg = 'Invalid JSON response from GitHub API.';
            fixHint = 'Check if API endpoint returns HTML (e.g., rate limit page).';
        }

        return res.status(statusCode).json({
            error: errorMsg,
            fix_hint: fixHint || 'Check server logs for full stack trace',
            details: err.stack
        });
    }
};
