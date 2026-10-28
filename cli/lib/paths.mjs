import { homedir } from 'os';
import { join } from 'path';
import { readdir } from 'fs/promises';

const SKILLS_ROOT = join(homedir(), '.claude', 'skills');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// Slugs come from the user and from the server. Never let one escape SKILLS_ROOT.
export function skillDir(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`Invalid skill slug: ${JSON.stringify(slug)}`);
  }
  return join(SKILLS_ROOT, slug);
}

export function skillFile(slug) {
  return join(skillDir(slug), 'SKILL.md');
}

export async function installedSlugs() {
  try {
    const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}
