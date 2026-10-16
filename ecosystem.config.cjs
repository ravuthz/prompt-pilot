module.exports = {
    apps: [
        {
            name: "prompt-pilot",
            cwd: "/Users/ravuthz/Projects/@oooo/tools/auto-prompts",
            script: "/Users/ravuthz/.bun/bin/bun",
            args: "run mcp-server.ts --http",
            interpreter: "none",
            autorestart: true,
            watch: false,
            max_restarts: 10,
            restart_delay: 3000,
            time: true,
        },
        {
            name: "prompt-pilot-tunnel",
            script: "/opt/homebrew/bin/cloudflared",
            args: [
                "tunnel",
                "--config",
                "/Users/ravuthz/.cloudflared/prompt-pilot.yml",
                "run",
                "prompt-pilot",
            ],
            interpreter: "none",
            autorestart: true,
            watch: false,
            max_restarts: 10,
            restart_delay: 3000,
            time: true,
        },
    ],
};
