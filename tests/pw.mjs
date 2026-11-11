// Playwright 를 여는 유일한 곳. 새 설치 없이 이미 깔린 모듈·캐시 브라우저를 쓴다.
// DOODLE_PW: playwright 모듈 폴더, DOODLE_CHROME: 브라우저 실행 파일
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const PW = process.env.DOODLE_PW ?? path.join(os.homedir(), '.hermes/hermes-agent/node_modules/playwright');
const CHROME = process.env.DOODLE_CHROME ?? path.join(os.homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell');

function fail(msg) {
  console.error(`${msg}\n환경변수로 경로를 지정하세요: DOODLE_PW=<playwright 모듈 폴더> DOODLE_CHROME=<chromium 실행 파일>`);
  process.exit(1);
}

let playwright;
try { playwright = require(PW); } catch (e) { fail(`playwright 모듈을 못 찾음: ${PW} (${e.message})`); }
if (!fs.existsSync(CHROME)) fail(`브라우저 실행 파일이 없음: ${CHROME}`);

export function launch(opts = {}) {
  return playwright.chromium.launch({ executablePath: CHROME, ...opts });
}
