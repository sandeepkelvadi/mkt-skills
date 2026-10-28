import { homedir } from 'os';
import { join } from 'path';
import { readdir } from 'fs/promises';

const SKILLS_ROOT = join(homedir(), '.claude', 'skills');

export function skillDir(slug) {
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
