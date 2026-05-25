const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Only allow POST requests (image uploads)
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const payload = JSON.parse(event.body);
        const token = process.env.GITHUB_TOKEN; // Safely pulled from Netlify's secret settings vault
        
        // Securely talk to GitHub from the server side where F12 can't see
        const res = await fetch(`https://api.github.com/repos/${payload.user}/${payload.repo}/contents/db.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Netlify-Gateway'
            },
            body: JSON.stringify({
                message: "Update vouch database ledger",
                content: payload.content,
                sha: payload.sha
            })
        });

        if (!res.ok) {
            const errData = await res.text();
            return { statusCode: res.status, body: errData };
        }

        const data = await res.json();
        return {
            statusCode: 200,
            body: JSON.stringify({ sha: data.content.sha })
        };
    } catch (err) {
        return { statusCode: 500, body: err.toString() };
    }
};