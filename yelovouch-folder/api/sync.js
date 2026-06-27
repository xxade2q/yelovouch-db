// ============================================================
// COMPLETE api/sync.js — PRODUCTION READY
// COPY THIS ENTIRE FILE AND PASTE INTO /api/sync.js
// ============================================================

const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Validate body exists
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    const { user, repo, content, sha } = req.body;
    const token = process.env.GITHUB_TOKEN;

    // ============================================================
    // VALIDATION BLOCK
    // ============================================================
    if (!token) {
        return res.status(500).json({
            error: 'GITHUB_TOKEN not configured on server',
            fix: 'Add GITHUB_TOKEN to Vercel environment variables'
        });
    }

    if (!user || !repo) {
        return res.status(400).json({
            error: 'Missing user or repo in request',
            received: { user, repo }
        });
    }

    if (!content || typeof content !== 'string') {
        return res.status(400).json({
            error: 'Missing or invalid content (must be base64 string)',
            received_type: typeof content
        });
    }

    // Validate base64 length (minimum for empty JSON: ~50 chars)
    if (content.length < 10) {
        return res.status(400).json({
            error: 'Content too short — invalid base64',
            length: content.length
        });
    }

    // Validate base64 encoding
    try {
        const decoded = Buffer.from(content, 'base64').toString('utf-8');
        JSON.parse(decoded); // ensure it's valid JSON
    } catch (e) {
        return res.status(400).json({
            error: 'Content is not valid base64-encoded JSON',
            details: e.message
        });
    }

    // ============================================================
    // GITHUB API CALL
    // ============================================================
    try {
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contents/db.json`;

        // Build payload
        const payload = {
            message: `Update vouches - ${new Date().toISOString()}`,
            content: content,
            committer: {
                name: 'YeloVouch Bot',
                email: 'bot@yelovouch.local'
            }
        };

        // CRITICAL FIX: Only add sha if it's a non-empty string
        if (sha && typeof sha === 'string' && sha.length > 0) {
            payload.sha = sha;
        }
        // If sha is undefined, null, or empty string — omit it (creates new file)

        // Execute with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'YeloVouch-Server/1.0',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        // Parse response
        const data = await response.json();

        // ============================================================
        // SUCCESS HANDLING
        // ============================================================
        if (response.ok) {
            return res.status(200).json({
                success: true,
                sha: data.content?.sha || null,
                commitSha: data.commit?.sha || null,
                message: 'File synchronized successfully'
            });
        }

        // ============================================================
        // ERROR HANDLING — DETAILED
        // ============================================================
        let errorMessage = 'GitHub API error';
        let statusCode = response.status;
        let fixHint = '';

        switch (response.status) {
            case 400:
                errorMessage = 'Bad request — malformed JSON or invalid content';
                fixHint = 'Check that content is valid base64 and JSON structure is correct';
                break;
            case 401:
                errorMessage = 'GitHub token invalid or expired';
                fixHint = 'Regenerate token with repo:contents scope and update Vercel env';
                break;
            case 403:
                errorMessage = 'Permission denied or rate limit exceeded';
                fixHint = 'Check token scopes (needs repo) or wait for rate limit reset';
                break;
            case 404:
                errorMessage = 'Repository or file not found';
                fixHint = 'Verify repo name and user. If db.json does not exist, omit sha to create it';
                break;
            case 409:
                errorMessage = 'Conflict — file changed remotely';
                fixHint = 'Fetch latest SHA via GET before retrying, or use force push';
                break;
            case 422:
                errorMessage = 'Unprocessable entity — SHA mismatch or invalid content';
                if (data.message && data.message.includes('sha')) {
                    errorMessage = 'SHA mismatch — provide correct SHA or omit for new file';
                    fixHint = 'If creating new file, send sha: undefined (not empty string)';
                } else {
                    fixHint = 'Verify JSON is valid and base64 encoded without line breaks';
                }
                break;
            default:
                errorMessage = `GitHub returned status ${response.status}`;
                fixHint = 'Check GitHub API documentation for this status code';
        }

        return res.status(statusCode).json({
            error: errorMessage,
            github_status: response.status,
            github_message: data.message || 'No additional details',
            fix_hint: fixHint,
            details: data
        });

    } catch (err) {
        // ============================================================
        // NETWORK / TIMEOUT ERROR
        // ============================================================
        let errorMsg = err.message;
        let fixHint = '';

        if (err.name === 'AbortError') {
            errorMsg = 'Request timed out after 15 seconds';
            fixHint = 'Check GitHub API status or reduce payload size';
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            errorMsg = 'Cannot reach GitHub API — network error';
            fixHint = 'Check Vercel outbound network policies';
        } else if (err.message.includes('JSON')) {
            errorMsg = 'Invalid JSON response from GitHub';
            fixHint = 'GitHub may be returning HTML (rate limit page)';
        }

        return res.status(500).json({
            error: errorMsg,
            fix_hint: fixHint || 'Check Vercel function logs for stack trace',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};
