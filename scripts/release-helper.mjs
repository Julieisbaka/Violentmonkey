import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import github from '@actions/github';
import { exec } from './common.js';

const { VERSION, GITHUB_TOKEN } = process.env;
const SAFE_ROOT_DIR = resolve(process.env.SAFE_ROOT_DIR || (() => {
  throw new Error('SAFE_ROOT_DIR environment variable is not set.');
})());
const ASSETS_DIR = (() => {
  const resolvedPath = resolve(SAFE_ROOT_DIR, process.env.ASSETS_DIR || '');
  if (!resolvedPath.startsWith(SAFE_ROOT_DIR)) {
    throw new Error(`Invalid ASSETS_DIR: ${process.env.ASSETS_DIR}`);
  }
  return resolvedPath;
})();
const tag = `v${VERSION}`;

let octokit;
function getOctokit() {
  octokit ||= github.getOctokit(GITHUB_TOKEN);
  return octokit;
}

export async function getRelease() {
  try {
    const result = await getOctokit().rest.repos.getReleaseByTag({
      ...github.context.repo,
      tag,
    });
    console.info('Found release:', tag);
    return result.data;
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

function listCommits() {
  const thisTag = exec('git describe --abbrev=0 --tags');
  const prevTag = exec(`git describe --abbrev=0 --tags "${thisTag}^"`);
  const tagRange = `${prevTag}...${thisTag}`;
  const list = exec(`git log --oneline --skip=1 --reverse "${tagRange}"`)
  .replace(/</g, '\\<')
  .split('\n')
  .map((str, i) => `${str.split(/\s/, 2)[1]}${10000 + i}\n* ${str}`)
  .sort()
  .map(str => str.split('\n')[1])
  .join('\n');
  return `${prevTag}:\n${list}\n\nCommit log: ${
    process.env.GITHUB_SERVER_URL || 'https://github.com'
  }/${
    process.env.GITHUB_REPOSITORY || 'violentmonkey/violentmonkey'
  }/compare/${tagRange}`;
}

function getReleaseNote() {
  return `${process.env.PRERELEASE === 'true' ? `\
**This is a beta release of Violentmonkey (also in [WebStore](\
https://chrome.google.com/webstore/detail/violentmonkey-beta/opokoaglpekkimldnlggpoagmjegichg\
)), use it at your own risk.**<br>\
If you already use Violentmonkey, click \`Export to zip\` in settings before installing the beta.

` : ''}Notable changes since ${listCommits()}`;
}

export async function createRelease() {
  console.info('Create release:', tag);
  const result = await getOctokit().rest.repos.createRelease({
    ...github.context.repo,
    tag_name: tag,
    name: process.env.RELEASE_NAME,
    body: getReleaseNote(),
    prerelease: process.env.PRERELEASE == 'true',
  });
  return result.data;
}

export async function ensureRelease() {
  const release = await getRelease() || await createRelease();
  return release;
}

export async function hasAsset(fileName) {
  const release = await getRelease();
  return release?.assets.some(asset => asset.name === fileName);
}

export async function uploadAssets() {
  const release = await ensureRelease();
  let assets = await readdir(ASSETS_DIR);
  assets = assets.filter(asset => release.assets.every(({ name }) => name !== asset));
  for (const asset of assets) {
    console.info(`> Upload asset: ${asset}`);
    await getOctokit().rest.repos.uploadReleaseAsset({
      ...github.context.repo,
      release_id: release.id,
      name: asset,
      data: await readFile(join(ASSETS_DIR, asset)),
    });
  }
  if (assets.length) console.info('Done');
  else console.info('No asset to upload');
}

export async function notifyReleaseStatus({ title, description, success = true }) {
  const { DISCORD_WEBHOOK_RELEASE } = process.env;
  if (!DISCORD_WEBHOOK_RELEASE) {
    console.warn('DISCORD_WEBHOOK_RELEASE is not available!');
    return;
  }
  const allowedDomains = ['discord.com', 'discordapp.com'];
  try {
    const url = new URL(DISCORD_WEBHOOK_RELEASE);
    if (url.protocol !== 'https:') {
      console.error(`Invalid DISCORD_WEBHOOK_RELEASE protocol: ${url.protocol}`);
      return;
    }
    if (url.protocol !== 'https:') {
      console.error(`Invalid DISCORD_WEBHOOK_RELEASE protocol: ${url.protocol}`);
      return;
    }
    if (!allowedDomains.includes(url.hostname)) {
      console.error(`Invalid DISCORD_WEBHOOK_RELEASE domain: ${url.hostname}`);
      return;
    }
  } catch (error) {
    console.error(`Invalid DISCORD_WEBHOOK_RELEASE URL: ${DISCORD_WEBHOOK_RELEASE}`);
    return;
  }
  const res = await fetch(DISCORD_WEBHOOK_RELEASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds: [
        {
          title,
          description,
          color: success ? 0x00ff00 : 0xff0000,
        },
      ],
    }),
  });
  if (!res.ok) console.error(res);
}
