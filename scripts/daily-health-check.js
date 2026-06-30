const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const checkedAt = new Date();
const date = dateFormatter.format(checkedAt);
const baseURL = readBaseURL();
const timeoutMs = Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 12000);
const maxConcurrency = Number(process.env.HEALTH_CHECK_CONCURRENCY || 6);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const urls = collectUrls();
  const localAssets = collectLocalAssets();
  const urlChecks = await runPool(urls, maxConcurrency, checkUrl);
  const localChecks = localAssets.map(checkLocalAsset);
  const brokenUrls = urlChecks.filter((check) => !check.ok);
  const missingAssets = localChecks.filter((check) => !check.ok);
  const homepage = urlChecks.find((check) => check.url === baseURL);
  const cv = urlChecks.find((check) => check.url === new URL("/files/cv.pdf", baseURL).href);

  const report = {
    date,
    checkedAt: checkedAt.toISOString(),
    timezone: "Asia/Jakarta",
    baseURL,
    summary: {
      ok: brokenUrls.length === 0 && missingAssets.length === 0,
      totalUrls: urlChecks.length,
      reachableUrls: urlChecks.length - brokenUrls.length,
      brokenUrls: brokenUrls.length,
      localAssets: localChecks.length,
      missingLocalAssets: missingAssets.length,
      homepageStatus: homepage?.status ?? null,
      homepageResponseTimeMs: homepage?.responseTimeMs ?? null,
      cvStatus: cv?.status ?? null,
      cvResponseTimeMs: cv?.responseTimeMs ?? null,
    },
    checks: {
      urls: urlChecks,
      localAssets: localChecks,
    },
  };

  const historyReport = {
    date: report.date,
    checkedAt: report.checkedAt,
    timezone: report.timezone,
    baseURL: report.baseURL,
    summary: report.summary,
    unhealthy: {
      urls: brokenUrls,
      localAssets: missingAssets,
    },
  };

  writeJson(path.join(root, "data/health/latest.json"), report);
  writeJson(path.join(root, `data/health/history/${date}.json`), historyReport);

  console.log(
    `Health check complete: ${report.summary.reachableUrls}/${report.summary.totalUrls} URLs reachable, ` +
      `${report.summary.localAssets - report.summary.missingLocalAssets}/${report.summary.localAssets} local assets present.`
  );

  if (!report.summary.ok) {
    console.log("Unhealthy checks were recorded in data/health/latest.json.");
  }
}

function readBaseURL() {
  const hugo = fs.readFileSync(path.join(root, "hugo.toml"), "utf8");
  const match = hugo.match(/^baseURL\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("baseURL not found in hugo.toml");
  return match[1].endsWith("/") ? match[1] : `${match[1]}/`;
}

function collectUrls() {
  const urls = new Set([
    baseURL,
    new URL("/files/cv.pdf", baseURL).href,
    new URL("/index.json", baseURL).href,
    "https://www.credly.com/users/haululazkiyaa/badges.json",
  ]);

  for (const file of listFiles(["content", "data", "layouts", "hugo.toml"])) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of text.matchAll(/https?:\/\/[^\s"'<>),]+/g)) {
      const url = stripTrailingPunctuation(match[0]);
      if (url.includes("{{") || url.includes("}}")) continue;
      urls.add(url);
    }
  }

  return Array.from(urls).sort();
}

function collectLocalAssets() {
  const assets = new Set(["/files/cv.pdf", "/css/main.css", "/js/main.js"]);

  for (const file of listFiles(["content", "data", "layouts"])) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of text.matchAll(/["'(](\/(?:files|images|css|js)\/[^"')\s]+)["')]/g)) {
      if (match[1].includes("{{") || match[1].includes("}}")) continue;
      assets.add(match[1]);
    }
  }

  return Array.from(assets).sort();
}

function listFiles(entries) {
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(root, entry);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      files.push(entry);
      continue;
    }
    walk(absolute);
  }

  return files;

  function walk(directory) {
    for (const name of fs.readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute);
      if (relative === "data/health" || relative.startsWith("data/health/")) continue;
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
      } else {
        files.push(relative);
      }
    }
  }
}

function checkLocalAsset(assetPath) {
  const staticPath = path.join(root, "static", assetPath.replace(/^\//, ""));
  const publicPath = path.join(root, "public", assetPath.replace(/^\//, ""));
  const exists = fs.existsSync(staticPath) || fs.existsSync(publicPath);

  return {
    path: assetPath,
    ok: exists,
    source: fs.existsSync(staticPath) ? "static" : fs.existsSync(publicPath) ? "public" : null,
  };
}

async function checkUrl(url) {
  const started = performance.now();

  try {
    let response = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    if (response.status === 405 || response.status === 403) {
      response = await fetchWithTimeout(url, { method: "GET", redirect: "follow" });
    }

    const status = response.status;
    return {
      url,
      ok: isReachableStatus(status, url),
      status,
      responseTimeMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      responseTimeMs: Math.round(performance.now() - started),
      error: error.message,
    };
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "haululazkiyaa.id daily health check",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isReachableStatus(status, url) {
  if ((status >= 200 && status < 400) || status === 401 || status === 403) return true;
  if (status === 999 && new URL(url).hostname.endsWith("linkedin.com")) return true;
  return false;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runNext() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

function stripTrailingPunctuation(url) {
  return url.replace(/[.;]+$/, "");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
