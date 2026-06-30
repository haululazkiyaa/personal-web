const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const username = process.env.CREDLY_USERNAME || "haululazkiyaa";
const timeoutMs = Number(process.env.CREDLY_SYNC_TIMEOUT_MS || 15000);
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const checkedAt = new Date();
  const date = dateFormatter.format(checkedAt);
  const aboutPath = path.join(root, "data/about.yaml");
  const originalAbout = fs.readFileSync(aboutPath, "utf8");
  const existing = parseExistingCertifications(originalAbout);
  const badges = await fetchCredlyBadges(username);
  const generated = generateCertifications(originalAbout, badges, existing);
  const imageResults = [];

  fs.writeFileSync(aboutPath, generated.aboutYaml);

  for (const image of generated.imagesToDownload) {
    imageResults.push(await downloadImage(image));
  }

  const report = {
    date,
    checkedAt: checkedAt.toISOString(),
    username,
    totalBadges: badges.length,
    previousBadges: existing.byId.size,
    newBadges: generated.newBadges,
    downloadedImages: imageResults.filter((result) => result.ok && result.downloaded).length,
    skippedImages: imageResults.filter((result) => result.ok && !result.downloaded).length,
    failedImages: imageResults.filter((result) => !result.ok),
  };

  writeJson(path.join(root, "data/credly/latest-sync.json"), report);

  console.log(
    `Credly sync complete: ${report.totalBadges} badges, ${report.newBadges.length} new, ` +
      `${report.downloadedImages} images downloaded.`
  );

  if (report.failedImages.length > 0) {
    throw new Error(`${report.failedImages.length} badge images failed to download`);
  }
}

async function fetchCredlyBadges(user) {
  const badges = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `https://www.credly.com/users/${encodeURIComponent(user)}/badges.json?page=${page}`;
    const json = await fetchJson(url);
    badges.push(...json.data);
    totalPages = Number(json.metadata?.total_pages || 1);
    page += 1;
  } while (page <= totalPages);

  return badges.sort((a, b) => new Date(b.issued_at_date) - new Date(a.issued_at_date));
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Credly request failed: ${response.status} ${url}`);
  }
  return response.json();
}

function parseExistingCertifications(text) {
  const byId = new Map();
  const byBadgePath = new Set();
  const certStart = text.indexOf("\ncertifications:\n");
  const section = certStart === -1 ? "" : text.slice(certStart + 1);
  const blocks = section.split(/\n\s*\n/).filter((block) => block.includes("url:"));

  for (const block of blocks) {
    const id = block.match(/credly\.com\/badges\/([^/]+)\/public_url/)?.[1];
    const badge = block.match(/badge: "([^"]+)"/)?.[1];
    if (badge) byBadgePath.add(badge);
    if (!id) continue;
    byId.set(id, {
      name: block.match(/name: "([^"]*)"/)?.[1],
      issuer: block.match(/issuer: "([^"]*)"/)?.[1],
      badge,
    });
  }

  return { byId, byBadgePath };
}

function generateCertifications(originalAbout, badges, existing) {
  const certStart = originalAbout.indexOf("\ncertifications:\n");
  if (certStart === -1) throw new Error("certifications section not found in data/about.yaml");

  const prefix = originalAbout.slice(0, certStart + 1);
  const usedBadgePaths = new Set(existing.byBadgePath);
  const imagesToDownload = [];
  const newBadges = [];
  let yaml = "certifications:\n";

  for (const badge of badges) {
    const previous = existing.byId.get(badge.id);
    const issuer = previous?.issuer || issuerName(badge);
    const name = previous?.name || cleanBadgeName(badge.badge_template.name);
    let badgePath = previous?.badge;

    if (!badgePath) {
      badgePath = buildUniqueBadgePath(issuer, name, usedBadgePaths);
      newBadges.push({
        id: badge.id,
        name,
        issuer,
        issuedAt: badge.issued_at_date,
        url: publicUrl(badge),
      });
    }

    usedBadgePaths.add(badgePath);
    const target = path.join(root, "static", badgePath.replace(/^\//, ""));
    if (!fs.existsSync(target)) {
      imagesToDownload.push({
        url: badge.image_url || badge.badge_template.image_url,
        target,
        badgePath,
      });
    }

    yaml += `  - name: "${escapeYamlString(name)}"\n`;
    yaml += `    issuer: "${escapeYamlString(issuer)}"\n`;
    yaml += `    year: ${new Date(badge.issued_at_date).getFullYear()}\n`;
    yaml += `    badge: "${badgePath}"\n`;
    yaml += `    url: "${publicUrl(badge)}"\n\n`;
  }

  return {
    aboutYaml: prefix + yaml,
    imagesToDownload,
    newBadges,
  };
}

function issuerName(badge) {
  return (
    badge.issuer?.entities?.find((entity) => entity.primary)?.entity?.name ||
    badge.issuer?.entities?.[0]?.entity?.name ||
    "Unknown"
  );
}

function cleanBadgeName(name) {
  return name.replace(/ Skill Badge$/, "").replace(/ - Training Badge$/, "");
}

function publicUrl(badge) {
  return `https://www.credly.com/badges/${badge.id}/public_url`;
}

function buildUniqueBadgePath(issuer, name, usedBadgePaths) {
  const base = `${issuerPrefix(issuer)}-${slugify(name)}`;
  let filename = `${base}.png`;
  let suffix = 2;

  while (usedBadgePaths.has(`/images/certs/${filename}`) || fs.existsSync(path.join(root, "static/images/certs", filename))) {
    filename = `${base}-${suffix}.png`;
    suffix += 1;
  }

  return `/images/certs/${filename}`;
}

function issuerPrefix(issuer) {
  if (issuer === "Google Cloud") return "gcp";
  if (issuer.startsWith("Amazon Web Services")) return "aws";
  if (issuer === "Unity Technologies") return "unity";
  return slugify(issuer) || "cert";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-skill-badge$/, "")
    .replace(/-training-badge$/, "");
}

async function downloadImage(image) {
  if (!image.url) {
    return { ...image, ok: false, downloaded: false, error: "missing image URL" };
  }

  if (fs.existsSync(image.target)) {
    return { ...image, ok: true, downloaded: false };
  }

  try {
    const response = await fetchWithTimeout(image.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(image.target), { recursive: true });
    fs.writeFileSync(image.target, buffer);
    return { ...image, ok: true, downloaded: true };
  } catch (error) {
    return { ...image, ok: false, downloaded: false, error: error.message };
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "haululazkiyaa.id credly sync",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function escapeYamlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
