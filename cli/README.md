# mkt-skills

Install Claude Code marketing skills from [marketingskills.directory](https://marketingskills.directory).

## Quick Start

```bash
npx mkt-skills install seo-content
```

This downloads the skill and saves it to `~/.claude/skills/seo-content/SKILL.md`, ready for Claude Code to use.

## Commands

### Install a skill

```bash
npx mkt-skills install <slug>
npx mkt-skills install seo-content --force   # overwrite existing
```

### List available skills

```bash
npx mkt-skills list
npx mkt-skills list --category=seo
```

### Search skills

```bash
npx mkt-skills search "email automation"
npx mkt-skills search content
```

### Skill details

```bash
npx mkt-skills info marketing-audit
```

### Uninstall a skill

```bash
npx mkt-skills uninstall seo-content
```

## Requirements

- Node.js 18 or later
- Claude Code (skills are installed to `~/.claude/skills/`)

## Local Development

Override the API URL for testing against a local WordPress instance:

```bash
MKT_API_URL=http://localhost:8080/wp-json/mkt/v1 npx mkt-skills list
```

## Source

https://github.com/sandeepkelvadi/mkt-skills

## License

MIT
