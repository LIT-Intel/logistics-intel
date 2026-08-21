# AI Employee avatars

Static profile photos for the AI Employees console (`/app/admin/ai-employees`).

Served at the site root, so a file here named `harvey.jpg` is reachable at `/agents/harvey.jpg`.

Harvey's config (`lit_agent_config.config.profile.avatarUrl`) already points at `/agents/harvey.jpg`.
Drop the headshot here as `harvey.jpg` (or `.png` — if you use a different extension, tell me and I'll update the config). The console falls back to Harvey's initials until the file is present.
