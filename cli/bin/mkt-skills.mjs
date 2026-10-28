#!/usr/bin/env node

import { install, list, search, info, uninstall, sets, installSet, setInfo } from '../lib/commands.mjs';
import { video } from '../lib/video.mjs';

const [,, rawCommand, subCommand, ...args] = process.argv;

// Normalize hyphenated commands: "install-set" -> lookup key
const commandMap = {
  install, list, search, info, uninstall, sets,
  'install-set': installSet,
  'set-info': setInfo,
};

const command = rawCommand;

// Handle "generate video" as a special case
if (command === 'generate' && subCommand === 'video') {
  try {
    await video(args);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Request timed out. Check your internet connection.');
    } else if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED') {
      console.error('Could not connect. Check your internet connection.');
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

if (!command || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log('mkt-skills 1.3.1');
  process.exit(0);
}

if (!commandMap[command]) {
  console.error(`Unknown command: ${command}\nRun "mkt-skills --help" for usage.`);
  process.exit(1);
}

try {
  // subCommand is argv[3]; reassemble the full positional list (it was dropped before)
  await commandMap[command]([subCommand, ...args].filter(Boolean));
} catch (err) {
  if (err.name === 'AbortError') {
    console.error('Request timed out. Check your internet connection.');
  } else if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED') {
    console.error('Could not connect to marketingskills.directory. Check your internet connection.');
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
}

function showHelp() {
  console.log(`
Marketing Skills Directory CLI

Usage:
  npx mkt-skills <command> [args]

Commands:
  install <slug>        Install a skill to ~/.claude/skills/
  list                  List all available skills
  search "<query>"      Find skills by what you want to do (ranked)
  info <slug>           Show details about a skill
  uninstall <slug>      Remove an installed skill
  sets                  List available skill sets
  install-set <slug>    Install all skills in a set
  set-info <slug>       Show details about a skill set
  generate video        Scaffold a new video production pipeline

Options:
  --help, -h            Show this help
  --version, -v        Show version
  --force, -f           Overwrite existing skills
  --code CODE           Access code to unlock premium skills
  --dry-run, -n         Preview without writing files (generate video)

Examples:
  npx mkt-skills install seo-content
  npx mkt-skills search "email automation"
  npx mkt-skills list --category=seo
  npx mkt-skills info marketing-audit
  npx mkt-skills install-set thrivemattic-marketing-suite
  npx mkt-skills generate video
  npx mkt-skills generate video my-project --dry-run

https://marketingskills.directory
`);
}
