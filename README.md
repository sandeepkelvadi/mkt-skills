# mkt-skills

Free Claude Code skills and tools from [Marketing Skills Directory](https://marketingskills.directory), a reviewed directory of 340+ Claude Code skills and MCP servers for marketing and SEO.

## What is in this repo

| Folder | What it is |
|---|---|
| [`cli/`](cli/) | The `mkt-skills` installer on npm. Search and install any skill from the directory. |
| [`skills/`](skills/) | Free skills written by Thrivemattic. |
| [`server.json`](server.json) | The listing for the remote MCP server in the official MCP Registry. |

## Install a skill

```bash
npx mkt-skills search "seo audit"
npx mkt-skills install gsc-setup
```

The installer saves the skill to `~/.claude/skills/<slug>/SKILL.md`.

To install a skill from this repo by hand, copy its folder into `~/.claude/skills/` (all projects) or `.claude/skills/` (one project).

## Skills

| Skill | What it does |
|---|---|
| [gsc-setup](skills/gsc-setup/) | Connects to Google Search Console with OAuth2: URL inspection, search analytics, sitemaps and indexing errors. |
| [wordpress-blocks](skills/wordpress-blocks/) | Writes valid WordPress block markup for pages, posts and templates. |
| [wp-migration](skills/wp-migration/) | Moves a WordPress site from local to live, or syncs content between them. |

Browse all skills at [marketingskills.directory](https://marketingskills.directory).

## Remote MCP server

Search the directory from any MCP client. No auth needed.

```
https://marketingskills.directory/wp-json/mkt/v1/mcp
```

Registry name: `io.github.sandeepkelvadi/marketing-skills-directory`

## Submit a skill

Use [marketingskills.directory/submit-skill/](https://marketingskills.directory/submit-skill/).

## License

MIT. See [LICENSE](LICENSE).
