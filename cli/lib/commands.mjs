import { mkdir, rm, access, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { fetchCatalog, fetchInstall, fetchSets, fetchSet, fetchSearch } from './api.mjs';
import { skillDir, skillFile, installedSlugs } from './paths.mjs';
import { bold, dim, green, red, yellow, cyan } from './ui.mjs';

// ── install ─────────────────────────────────────────────────

export async function install(args) {
  const force    = args.includes('--force') || args.includes('-f');
  const codeFlag = args.find(a => a.startsWith('--code=')) || args.find((a, i, arr) => a === '--code' && arr[i + 1]);
  const code     = codeFlag?.startsWith('--code=') ? codeFlag.split('=')[1] : (args.includes('--code') ? args[args.indexOf('--code') + 1] : null);
  const slug     = args.find(a => !a.startsWith('-') && a !== code);

  if (!slug) {
    console.error(`Usage: mkt-skills install <slug> [--force] [--code CODE]\n`);
    process.exit(1);
  }

  const dest = skillFile(slug);

  if (!force) {
    try {
      await access(dest);
      const ok = await confirm(`Skill "${slug}" is already installed. Overwrite?`);
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    } catch { /* not installed — proceed */ }
  }

  let data;
  try {
    data = await fetchInstall(slug, code);
  } catch (err) {
    if (err.code === 'PREMIUM') {
      console.log(`\n${red('x')} ${bold(`"${slug}"`)} is a premium skill.`);
      if (code) {
        console.log(`  ${dim('->')} Access code was invalid or not applicable.`);
      }
      console.log(`  ${dim('->')} Purchase at: ${cyan(err.url)}\n`);
      process.exit(1);
    }
    if (err.code === 'NOT_FOUND') {
      console.log(`\n${red('x')} Skill "${slug}" not found.`);
      console.log(`  ${dim('->')} Browse available skills: ${cyan('npx mkt-skills list')}\n`);
      process.exit(1);
    }
    throw err;
  }

  await mkdir(skillDir(slug), { recursive: true });
  await writeFile(dest, data.content, 'utf-8');

  console.log(`\n${green('+')} Installed ${bold(`"${data.title}"`)} (${data.lines} lines)`);
  console.log(`  ${dim('->')} ${dest}\n`);
}

// ── list ────────────────────────────────────────────────────

export async function list(args) {
  const catFlag = args.find(a => a.startsWith('--category='));
  const catFilter = catFlag ? catFlag.split('=')[1].toLowerCase() : null;

  const catalog   = await fetchCatalog();
  const installed = new Set(await installedSlugs());

  let items = catalog;
  if (catFilter) {
    items = items.filter(s => s.categories.some(c => c.toLowerCase().includes(catFilter)));
  }

  if (items.length === 0) {
    console.log(catFilter
      ? `No skills found in category "${catFilter}".`
      : 'No skills available.');
    return;
  }

  console.log(`\n${bold('Marketing Skills Directory')} (${items.length} skills)\n`);

  const slugW  = Math.min(30, Math.max(4, ...items.map(s => s.slug.length)));
  const titleW = Math.min(35, Math.max(5, ...items.map(s => s.title.length)));

  const header = [
    'SLUG'.padEnd(slugW),
    'TITLE'.padEnd(titleW),
    'LINES'.padStart(5),
    'PRICE'.padEnd(7),
    'CATEGORY',
  ].join('  ');

  console.log(dim(header));
  console.log(dim('-'.repeat(header.length)));

  for (const s of items) {
    const inst = installed.has(s.slug) ? green(' [installed]') : '';
    const price = s.price === 'paid' ? yellow('paid') : green('free');
    const cats = s.categories.join(', ') || '-';
    console.log([
      s.slug.padEnd(slugW),
      (s.title.length > titleW ? s.title.slice(0, titleW - 1) + '\u2026' : s.title).padEnd(titleW),
      String(s.lines).padStart(5),
      price.padEnd(7 + (price.length - (s.price === 'paid' ? 4 : 4))),
      cats,
    ].join('  ') + inst);
  }

  console.log(`\n${dim('Install:')} npx mkt-skills install <slug>\n`);
}

// ── search ──────────────────────────────────────────────────

export function renderSearchResults(payload) {
  const { query, results = [] } = payload;
  const out = [];

  if (!results.length) {
    out.push(`\nNo close matches for ${bold(`"${query}"`)}.`);
    out.push(`${dim('->')} Browse all: ${cyan('npx mkt-skills list')}\n`);
    return out.join('\n');
  }

  out.push(`\n${bold(`Best matches for "${query}"`)}\n`);
  results.forEach((r, i) => {
    const price = r.price === 'paid' ? yellow(' [premium]') : '';
    const cats  = r.categories?.length ? dim(` (${r.categories.join(', ')})`) : '';
    out.push(`  ${bold(`${i + 1}. ${r.slug}`)}${price}${cats}`);
    out.push(`     ${r.description}`);
    if (r.matched && r.matched.length) {
      out.push(`     ${dim(`↳ matched: ${r.matched.join(', ')}`)}`);
    }
    out.push(`     ${dim('Install:')} ${cyan(`npx mkt-skills install ${r.slug}`)}`);
    out.push('');
  });
  return out.join('\n');
}

export async function search(args) {
  const query = args.filter(a => !a.startsWith('-')).join(' ');
  if (!query) {
    console.error('Usage: mkt-skills search "<what you want to do>"\n');
    process.exit(1);
  }
  const limitFlag = args.find(a => a.startsWith('--limit='));
  const parsedLimit = limitFlag ? parseInt(limitFlag.split('=')[1], 10) : NaN;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;

  const payload = await fetchSearch(query, limit);
  console.log(renderSearchResults(payload));
}

// ── info ────────────────────────────────────────────────────

export async function info(args) {
  const slug = args.find(a => !a.startsWith('-'));

  if (!slug) {
    console.error('Usage: mkt-skills info <slug>\n');
    process.exit(1);
  }

  const catalog = await fetchCatalog();
  const skill   = catalog.find(s => s.slug === slug);

  if (!skill) {
    console.log(`\n${red('x')} Skill "${slug}" not found.`);
    // suggest close matches
    const close = catalog.filter(s => s.slug.includes(slug) || slug.includes(s.slug)).slice(0, 3);
    if (close.length) {
      console.log(`\n  Did you mean?`);
      close.forEach(s => console.log(`    ${cyan(s.slug)}  ${s.title}`));
    }
    console.log('');
    process.exit(1);
  }

  const installed = (await installedSlugs()).includes(slug);
  const priceLabel = skill.price === 'paid' ? yellow('Premium') : green('Free');
  const secLabel = skill.security_level === 'safe' ? green('safe') : (skill.security_level || dim('unknown'));

  console.log(`\n${bold(skill.title)}\n`);
  console.log(`  Slug:        ${skill.slug}`);
  console.log(`  Price:       ${priceLabel}`);
  console.log(`  Lines:       ${skill.lines}`);
  console.log(`  Categories:  ${skill.categories.join(', ') || '-'}`);
  console.log(`  Security:    ${secLabel}`);
  console.log(`  Downloads:   ${skill.downloads}`);
  console.log(`  Installed:   ${installed ? green('yes') : 'no'}`);
  console.log(`\n  ${dim('Description:')}`);
  console.log(`  ${skill.description}`);
  console.log(`\n  ${dim('Install:')}`);
  console.log(`  npx mkt-skills install ${skill.slug}`);
  console.log(`\n  ${dim('Web:')}`);
  console.log(`  https://marketingskills.directory/skill/${skill.slug}/\n`);
}

// ── uninstall ───────────────────────────────────────────────

export async function uninstall(args) {
  const slug = args.find(a => !a.startsWith('-'));

  if (!slug) {
    console.error('Usage: mkt-skills uninstall <slug>\n');
    process.exit(1);
  }

  const dir = skillDir(slug);

  try {
    await access(dir);
  } catch {
    console.log(`\n${red('x')} Skill "${slug}" is not installed.\n`);
    process.exit(1);
  }

  await rm(dir, { recursive: true, force: true });
  console.log(`\n${green('+')} Uninstalled "${slug}"`);
  console.log(`  ${dim('->')} Removed ${dir}\n`);
}

// ── sets ───────────────────────────────────────────────────

export async function sets(args) {
  const allSets = await fetchSets();

  if (allSets.length === 0) {
    console.log('\nNo skill sets available yet.\n');
    return;
  }

  console.log(`\n${bold('Skill Sets')}\n`);

  const slugW = Math.max(4, ...allSets.map(s => s.slug.length));
  const nameW = Math.max(4, ...allSets.map(s => s.name.length));

  const header = [
    'SLUG'.padEnd(slugW),
    'NAME'.padEnd(nameW),
    'SKILLS',
  ].join('  ');

  console.log(dim(header));
  console.log(dim('-'.repeat(header.length)));

  for (const s of allSets) {
    console.log([
      s.slug.padEnd(slugW),
      s.name.padEnd(nameW),
      `${s.count} skills`,
    ].join('  '));
  }

  console.log(`\n${dim('Install a set:')} npx mkt-skills install-set <slug>\n`);
}

// ── install-set ────────────────────────────────────────────

export async function installSet(args) {
  const force    = args.includes('--force') || args.includes('-f');
  const codeFlag = args.find(a => a.startsWith('--code=')) || args.find((a, i, arr) => a === '--code' && arr[i + 1]);
  const code     = codeFlag?.startsWith('--code=') ? codeFlag.split('=')[1] : (args.includes('--code') ? args[args.indexOf('--code') + 1] : null);
  const slug     = args.find(a => !a.startsWith('-') && a !== code);

  if (!slug) {
    console.error('Usage: mkt-skills install-set <slug> [--force] [--code CODE]\n');
    process.exit(1);
  }

  let set;
  try {
    set = await fetchSet(slug);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      console.log(`\n${red('x')} Skill set "${slug}" not found.`);
      console.log(`  ${dim('->')} Browse sets: ${cyan('npx mkt-skills sets')}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`\n${bold(`Installing "${set.name}"`)} (${set.count} skills)\n`);

  const installed = new Set(await installedSlugs());
  let ok = 0, skipped = 0, premium = 0;

  for (const skill of set.skills) {
    const skillSlug = skill.slug;

    if (skill.price !== 'free' && !code) {
      console.log(`  ${dim('-')} ${skillSlug} — ${yellow('premium, skipped')}`);
      premium++;
      continue;
    }

    if (!force && installed.has(skillSlug)) {
      console.log(`  ${dim('-')} ${skillSlug} ${dim('[already installed]')}`);
      skipped++;
      continue;
    }

    try {
      const data = await fetchInstall(skillSlug, code);
      await mkdir(skillDir(skillSlug), { recursive: true });
      await writeFile(skillFile(skillSlug), data.content, 'utf-8');
      console.log(`  ${green('+')} ${skillSlug} (${data.lines} lines)`);
      ok++;
    } catch (err) {
      if (err.code === 'PREMIUM') {
        console.log(`  ${dim('-')} ${skillSlug} — ${yellow('premium, skipped')}`);
        premium++;
      } else {
        console.log(`  ${red('x')} ${skillSlug} — ${err.message}`);
      }
    }
  }

  const total = set.skills.length;
  const parts = [`${ok} installed`];
  if (skipped) parts.push(`${skipped} already installed`);
  if (premium) parts.push(`${premium} premium skipped`);

  console.log(`\n${bold(`Done.`)} ${parts.join(', ')} (${total} total)`);
  console.log(`  ${dim('->')} ~/.claude/skills/\n`);
}

// ── set-info ───────────────────────────────────────────────

export async function setInfo(args) {
  const slug = args.find(a => !a.startsWith('-'));

  if (!slug) {
    console.error('Usage: mkt-skills set-info <slug>\n');
    process.exit(1);
  }

  let set;
  try {
    set = await fetchSet(slug);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      console.log(`\n${red('x')} Skill set "${slug}" not found.`);
      console.log(`  ${dim('->')} Browse sets: ${cyan('npx mkt-skills sets')}\n`);
      process.exit(1);
    }
    throw err;
  }

  const installed = new Set(await installedSlugs());

  console.log(`\n${bold(set.name)}`);
  console.log(dim('-'.repeat(set.name.length)));
  if (set.description) {
    console.log(set.description);
  }
  console.log(`\n${set.count} skills:\n`);

  const slugW  = Math.max(4, ...set.skills.map(s => s.slug.length));
  const titleW = Math.min(30, Math.max(5, ...set.skills.map(s => s.title.length)));

  for (const s of set.skills) {
    const price = s.price === 'paid' ? yellow('paid') : green('free');
    const inst  = installed.has(s.slug) ? green(' [installed]') : '';
    const title = s.title.length > titleW ? s.title.slice(0, titleW - 1) + '\u2026' : s.title;
    console.log(`  ${s.slug.padEnd(slugW)}  ${title.padEnd(titleW)}  ${String(s.lines).padStart(5)} lines  ${price}${inst}`);
  }

  console.log(`\n${dim('Install:')} npx mkt-skills install-set ${set.slug}\n`);
}

// ── helpers ─────────────────────────────────────────────────

function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} (y/N) `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
