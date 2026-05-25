const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // Enable CORS handling so your frontend can communicate with the API smoothly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { user, repo, content, sha } = req.body;
        const token = process.env.GITHUB_TOKEN;

        if (!token) {
            return res.status(500).json({ error: 'System token configuration is missing on server.' });
        }

        // Connect directly to GitHub API to save changes securely
        const response = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/db.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Vercel-Server-Gateway'
            },
            body: JSON.stringify({
                message: 'Update vouch database ledger via secure console',
                content: content,
                sha: sha || undefined
            })
        });

        const data = await response.json();

        if (response.ok) {
            return res.status(200).json({ sha: data.content.sha });
        } else {
            return res.status(response.status).json({ error: data.message || 'GitHub communication failure' });
        }

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
