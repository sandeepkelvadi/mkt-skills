import { createInterface } from "readline";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { bold, dim, green, red, cyan } from "./ui.mjs";

const TEMPLATE_REPO = "https://github.com/sandeepkelvadi/tm-videogen-template.git";
const TEMPLATE_BRANCH = "main";
const TEMPLATE_DIR = "/tmp/.tm-videogen-template";

async function question(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer); });
  });
}

async function requiredQuestion(query, example) {
  let answer;
  while (!answer || !answer.trim()) {
    answer = await question(`${dim("?")} ${bold(query)} ${dim(`(${example})`)}: `);
    if (!answer || !answer.trim()) {
      console.log(`${red("  → Required. Please enter a value.")}`);
    }
  }
  return answer.trim();
}

async function optionalQuestion(query, example, defaultVal) {
  const answer = await question(`${dim("?")} ${bold(query)} ${dim(`(${example}) [default: ${defaultVal}]`)}: `);
  return (answer && answer.trim()) ? answer.trim() : defaultVal;
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} ${dim("(y/N)")}: `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function isValidHexColor(color) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

function isValidUrl(url) {
  return /^https?:\/\/.+/.test(url);
}

function printTree(name, indent = "") {
  console.log(`${indent}${dim("├──")} ${name}`);
}

async function substitute(content, vars) {
  let result = content;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }
  return result;
}

async function copyDirRecursive(src, dest, vars = {}) {
  await mkdir(dest, { recursive: true });
  const { readdir: read } = await import("fs/promises");
  const entries = await read(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyDirRecursive(srcPath, destPath, vars);
    } else {
      let finalContent = await readFile(srcPath, "utf-8");

      if (/\.(json|ts|tsx|md|sh)$/.test(entry.name)) {
        // Substitute template variables
        finalContent = await substitute(finalContent, vars);

        // Update package.json name
        if (entry.name === "package.json" && vars.PROJECT_NAME) {
          const pkg = JSON.parse(finalContent);
          pkg.name = vars.PROJECT_NAME;
          finalContent = JSON.stringify(pkg, null, 2);
        }
      }

      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, finalContent, "utf-8");
    }
  }
}

function exec(cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: "pipe" });
  } catch (e) {
    return null;
  }
  return true;
}

async function cloneTemplate() {
  if (existsSync(TEMPLATE_DIR)) {
    await rm(TEMPLATE_DIR, { recursive: true, force: true });
  }
  execSync(`git clone --depth=1 --branch ${TEMPLATE_BRANCH} ${TEMPLATE_REPO} "${TEMPLATE_DIR}"`, { stdio: "pipe" });
}

export async function video(args) {
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const force = args.includes("--force") || args.includes("-f");
  const skipInstall = args.includes("--skip-install");

  console.log(`\n${bold("Video Pipeline Generator")} ${dim("v1.1.0")}\n`);
  console.log(dim("All values are required unless marked [default].\n"));

  // ── Step 1: Project name ──────────────────────────────────
  let projectName = args.find(a => !a.startsWith("-"));
  if (!projectName) {
    projectName = await requiredQuestion("Project name", "e.g. sunshine-academy");
  }
  projectName = projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

  const outputDir = join(process.cwd(), projectName);

  if (existsSync(outputDir)) {
    if (!force) {
      const overwrite = await confirm(`Directory "${projectName}/" already exists. Overwrite?`);
      if (!overwrite) { console.log("Aborted.\n"); return; }
    }
    await rm(outputDir, { recursive: true, force: true });
  }

  if (dryRun) {
    console.log(`${dim("Dry run — no files will be written.\n")}`);
  }

  console.log(dim("─".repeat(50)));

  // ── Step 2: Brand setup ──────────────────────────────────
  console.log(`\n${bold("Brand Setup")}\n`);

  const brandName = await requiredQuestion("Brand name", "e.g. Sunshine Academy");
  const primaryColor = await requiredQuestion("Primary color (hex)", "e.g. #2d5016");
  if (!isValidHexColor(primaryColor)) {
    console.log(`${red("  → Invalid hex color. Use #RRGGBB format (e.g. #2d5016).\n")}`);
    process.exit(1);
  }

  const accentColor = await requiredQuestion("Accent color (hex)", "e.g. #8bc34a");
  if (!isValidHexColor(accentColor)) {
    console.log(`${red("  → Invalid hex color. Use #RRGGBB format (e.g. #8bc34a).\n")}`);
    process.exit(1);
  }

  const fontFamily = await optionalQuestion("Font family", "e.g. Poppins", "Poppins");
  const logoPath = await optionalQuestion("Logo file path", "e.g. logo.png", "logo.png");
  const websiteUrl = await requiredQuestion("Website URL", "e.g. https://sunshine.edu");
  if (!isValidUrl(websiteUrl)) {
    console.log(`${red("  → Invalid URL. Must start with http:// or https://.\n")}`);
    process.exit(1);
  }

  // ── Step 3: Campaign copy ─────────────────────────────────
  console.log(`\n${bold("Campaign Copy")}\n`);

  const headline = await requiredQuestion("Ad headline", "e.g. Admissions Open 2026");
  const ctaText = await requiredQuestion("CTA button text", "e.g. Chat with us");
  const year = await optionalQuestion("Year / season", "e.g. 2026-27", new Date().getFullYear().toString());
  const location = await requiredQuestion("Location", "e.g. HSR Layout, Bangalore");

  // ── Step 4: Asset source ───────────────────────────────────
  console.log(`\n${bold("Asset Setup")}\n`);

  const assetSource = await question(
    `${dim("?")} ${bold("Asset source")} ${dim("(local / gdrive / s3) [default: local]")}: `
  );
  const assetSrc = (assetSource && assetSource.trim()) ? assetSource.trim() : "local";

  console.log(dim("─".repeat(50)));

  // ── Step 5: Preview tree ─────────────────────────────────
  console.log(`\n${bold("Project structure:")} ${projectName}/\n`);
  printTree("config/");
  printTree("  brand.json");
  printTree("  campaign.json");
  printTree("public/");
  printTree("  logo.png        ← add your logo here");
  printTree("  clips/          ← add video clips here");
  printTree("  photos/        ← add photos here");
  printTree("  music/         ← add background music here");
  printTree("src/");
  printTree("  pipeline/");
  printTree("  types/");
  printTree("  brand.ts");
  printTree("  Root.tsx       ← add your compositions here");
  printTree("  index.ts");
  printTree("tools/");
  printTree("  ffmpeg_install.sh");
  printTree("  extract_clips.sh");
  printTree("package.json");
  printTree("README.md");
  console.log("");

  // ── Step 6: Config summary ────────────────────────────────
  console.log(`${bold("Config summary:")}\n`);
  console.log(`  ${dim("Brand:")}    ${brandName}`);
  console.log(`  ${dim("Colors:")}   ${primaryColor} / ${accentColor}`);
  console.log(`  ${dim("Font:")}     ${fontFamily}`);
  console.log(`  ${dim("URL:")}      ${websiteUrl}`);
  console.log(`  ${dim("Headline:")} ${headline}`);
  console.log(`  ${dim("CTA:")}      ${ctaText}`);
  console.log(`  ${dim("Year:")}     ${year}`);
  console.log(`  ${dim("Location:")} ${location}`);
  console.log("");

  if (dryRun) {
    console.log(`${green("✓")} Dry run complete. No files created.\n`);
    console.log(`${dim("Run without --dry-run to scaffold the project:")}\n`);
    console.log(`  ${cyan(`npx mkt-skills generate video ${projectName}`)}\n`);
    return;
  }

  // ── Step 7: Clone template ─────────────────────────────────
  console.log(`${dim("Cloning template from GitHub...")}`);
  try {
    await cloneTemplate();
  } catch {
    console.log(`\n${red("x")} Failed to clone template. Check your internet connection.\n`);
    process.exit(1);
  }

  // ── Step 8: Build vars & config ───────────────────────────
  const vars = {
    PROJECT_NAME: projectName,
    BRAND_NAME: brandName,
    PRIMARY_COLOR: primaryColor,
    ACCENT_COLOR: accentColor,
    FONT_FAMILY: fontFamily,
    LOGO_PATH: logoPath,
    WEBSITE_URL: websiteUrl,
    HEADLINE: headline,
    CTA_TEXT: ctaText,
    YEAR: year,
    LOCATION: location,
  };

  const brandJson = {
    primaryColor,
    accentColor,
    backgroundColor: "#000000",
    textColor: "#ffffff",
    fontFamily,
    fontWeights: ["400", "600", "700"],
    logoPath,
    websiteUrl,
  };

  const campaignJson = {
    headline,
    year,
    location,
    url: websiteUrl.replace(/^https?:\/\//, ""),
    ctaText,
  };

  // ── Step 9: Copy template ─────────────────────────────────
  console.log(`${dim("Scaffolding project...")}`);
  await copyDirRecursive(TEMPLATE_DIR, outputDir, vars);

  // Write brand config (no substitution needed — write direct)
  await writeFile(join(outputDir, "config", "brand.json"), JSON.stringify(brandJson, null, 2), "utf-8");
  await writeFile(join(outputDir, "config", "campaign.json"), JSON.stringify(campaignJson, null, 2), "utf-8");

  // Cleanup template
  await rm(TEMPLATE_DIR, { recursive: true, force: true });

  // ── Step 10: Install deps ──────────────────────────────────
  if (!skipInstall) {
    console.log(`${dim("Installing npm dependencies (this may take a minute)...")}`);
    const installed = exec("npm install --prefer-offline --silent 2>&1", outputDir);
    if (!installed) {
      console.log(`${dim("  npm install skipped or failed. Run 'npm install' manually.")}`);
    }
  }

  // ── Step 11: FFmpeg check ─────────────────────────────────
  const hasFfmpeg = exec("which ffmpeg && which ffprobe", outputDir);
  if (!hasFfmpeg) {
    console.log(`\n${dim("FFmpeg not found. Run 'npm run install-ffmpeg' to install it.")}`);
  }

  // ── Step 12: Done ─────────────────────────────────────────
  console.log(`\n${green("✓")} ${bold("Project created:")} ${projectName}/\n`);

  console.log(`${bold("Next steps:")}\n`);
  console.log(`  ${dim("1.")} ${cyan("cd " + projectName)}`);
  console.log(`  ${dim("2.")} Add your logo: ${dim("cp /path/to/logo.png public/logo.png")}`);
  console.log(`  ${dim("3.")} Add clips:    ${dim("cp /path/to/*.mp4 public/clips/")}`);
  console.log(`  ${dim("4.")} Add music:    ${dim("cp /path/to/*.mp3 public/music/")}`);
  console.log(`  ${dim("5.")} Edit ${dim("src/Root.tsx")} — replace placeholder segments with your content`);
  console.log(`  ${dim("6.")} ${cyan("npm run studio")} — preview in browser`);
  console.log(`  ${dim("7.")} Render: ${cyan(`npx remotion render src/index.ts <comp-id> out/video.mp4`)}\n`);
  console.log(`${dim("Composition IDs available in Root.tsx: myproject-square, myproject-vertical")}\n`);
}
