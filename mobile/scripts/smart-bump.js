#!/usr/bin/env node

/**
 * WuzzChat Smart Version Bumper
 * Menganalisis riwayat Git Commit (Conventional Commits) sejak bump rilis terakhir
 * untuk mendeteksi secara otomatis kenaikan versi:
 * - BREAKING CHANGE: atau !:  -> MAJOR (1.x.x -> 2.0.0, build +1)
 * - feat:                      -> MINOR (1.0.0 -> 1.1.0, build +1)
 * - fix:, perf:, refactor:     -> PATCH (1.0.0 -> 1.0.1, build +1)
 * - chore:, docs:, dll.        -> BUILD saja (versi tetap, build +1)
 * 
 * Penggunaan:
 *   node scripts/smart-bump.js            (eksekusi deteksi otomatis)
 *   node scripts/smart-bump.js --dry-run  (simulasi & cetak rencana tanpa ubah file)
 *   node scripts/smart-bump.js --type=fix (paksa tipe tertentu)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const pkgJsonPath = path.join(__dirname, '..', 'package.json');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forcedTypeArg = args.find((a) => a.startsWith('--type='));
const forcedType = forcedTypeArg ? forcedTypeArg.split('=')[1] : null;

// 1. Baca app.json & package.json
const appRaw = fs.readFileSync(appJsonPath, 'utf8');
const appData = JSON.parse(appRaw);

const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf8');
const pkgData = JSON.parse(pkgRaw);

const oldVersion = appData.expo.version || '1.0.0';
const oldVersionCode = appData.expo.android?.versionCode || 1;

let [major, minor, patch] = oldVersion.split('.').map(Number);
if (isNaN(major)) major = 1;
if (isNaN(minor)) minor = 0;
if (isNaN(patch)) patch = 0;

// 2. Fungsi deteksi Git Commits
function detectBumpTypeFromGit() {
  if (forcedType && ['major', 'minor', 'patch', 'build'].includes(forcedType)) {
    return { type: forcedType, reason: `Manual override (--type=${forcedType})`, commits: [] };
  }

  try {
    const currentHead = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

    // Dapatkan commit terakhir yang mengubah app.json
    let lastBumpCommit = '';
    try {
      lastBumpCommit = execSync('git log -n 1 --pretty=format:"%H" -- mobile/app.json app.json', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      lastBumpCommit = '';
    }

    let gitRange = 'HEAD -n 20';
    if (lastBumpCommit && lastBumpCommit !== currentHead) {
      gitRange = `${lastBumpCommit}..HEAD`;
    } else if (lastBumpCommit === currentHead) {
      // Jika app.json diubah di commit HEAD ini, cari commit sebelumnya
      try {
        const prevBumpCommit = execSync('git log -n 1 --skip=1 --pretty=format:"%H" -- mobile/app.json app.json', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        if (prevBumpCommit) {
          gitRange = `${prevBumpCommit}..HEAD`;
        }
      } catch {
        gitRange = 'HEAD -n 5';
      }
    }

    // Ambil log commit
    const logOutput = execSync(`git log ${gitRange} --pretty=format:"%h|%s|%b---COMMIT---"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (!logOutput) {
      return { type: 'build', reason: 'Tidak ada commit baru yang terdeteksi sejak rilis terakhir.', commits: [] };
    }

    const rawCommits = logOutput.split('---COMMIT---').map((c) => c.trim()).filter(Boolean);
    const parsedCommits = rawCommits.map((block) => {
      const parts = block.split('|');
      const hash = parts[0] || '';
      const subject = parts[1] || '';
      const body = parts.slice(2).join('|') || '';
      return { hash, subject, body, full: `${subject}\n${body}` };
    });

    let hasMajor = false;
    let hasMinor = false;
    let hasPatch = false;

    let triggeringCommit = '';

    for (const c of parsedCommits) {
      const fullText = c.full;
      const subject = c.subject;

      // Cek MAJOR (BREAKING CHANGE atau awalan feat!:, fix!:)
      if (
        fullText.includes('BREAKING CHANGE:') ||
        fullText.includes('BREAKING-CHANGE:') ||
        /^[a-z]+(\([^\)]+\))?!:/i.test(subject)
      ) {
        hasMajor = true;
        triggeringCommit = `[${c.hash}] ${subject}`;
        break;
      }

      // Cek MINOR (feat:)
      if (/^feat(\([^\)]+\))?:/i.test(subject)) {
        hasMinor = true;
        if (!triggeringCommit) triggeringCommit = `[${c.hash}] ${subject}`;
      }

      // Cek PATCH (fix:, perf:, refactor:, style:)
      if (/^(fix|perf|refactor|style)(\([^\)]+\))?:/i.test(subject)) {
        hasPatch = true;
        if (!triggeringCommit) triggeringCommit = `[${c.hash}] ${subject}`;
      }
    }

    if (hasMajor) {
      return {
        type: 'major',
        reason: `Mendeteksi perubahan breaking changes: ${triggeringCommit}`,
        commits: parsedCommits,
      };
    }
    if (hasMinor) {
      return {
        type: 'minor',
        reason: `Mendeteksi fitur baru (feat): ${triggeringCommit}`,
        commits: parsedCommits,
      };
    }
    if (hasPatch) {
      return {
        type: 'patch',
        reason: `Mendeteksi perbaikan atau optimasi (fix/perf/refactor): ${triggeringCommit}`,
        commits: parsedCommits,
      };
    }

    return {
      type: 'build',
      reason: 'Semua commit adalah chore/docs/pemeliharaan. Hanya menaikkan build number.',
      commits: parsedCommits,
    };
  } catch (err) {
    return {
      type: 'build',
      reason: `Gagal membaca git history (${err.message}). Fallback ke penambahan build number.`,
      commits: [],
    };
  }
}

// 3. Eksekusi perhitungan versi
const detection = detectBumpTypeFromGit();
const bumpType = detection.type;

let newVersion = oldVersion;
const newVersionCode = oldVersionCode + 1;

if (bumpType === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
  newVersion = `${major}.${minor}.${patch}`;
} else if (bumpType === 'minor') {
  minor += 1;
  patch = 0;
  newVersion = `${major}.${minor}.${patch}`;
} else if (bumpType === 'patch') {
  patch += 1;
  newVersion = `${major}.${minor}.${patch}`;
} else if (bumpType === 'build') {
  newVersion = oldVersion;
}

console.log('================================================================');
console.log(`🤖 [Smart Version Bumper] Analisis Git Conventional Commits`);
console.log(`   💡 Hasil Deteksi: Tipe -> ${bumpType.toUpperCase()}`);
console.log(`   📝 Alasan       : ${detection.reason}`);
if (detection.commits.length > 0) {
  console.log(`   📋 Commit Teranalisis (${detection.commits.length} commit):`);
  detection.commits.slice(0, 5).forEach((c) => {
    console.log(`      • [${c.hash}] ${c.subject}`);
  });
  if (detection.commits.length > 5) {
    console.log(`      • ... dan ${detection.commits.length - 5} commit lainnya.`);
  }
}
console.log('----------------------------------------------------------------');
console.log(`   📦 Versi Aplikasi : ${oldVersion} ➔ ${newVersion}`);
console.log(`   🔢 Android Build  : ${oldVersionCode} ➔ ${newVersionCode}`);
console.log(`   🍎 iOS Build      : "${oldVersionCode}" ➔ "${newVersionCode}"`);
console.log('================================================================');

if (isDryRun) {
  console.log(`ℹ️ [DRY RUN] Tidak ada file yang diubah di disk.`);
  process.exit(0);
}

// 4. Tulis hasil ke app.json & package.json
appData.expo.version = newVersion;
if (!appData.expo.android) appData.expo.android = {};
appData.expo.android.versionCode = newVersionCode;

if (!appData.expo.ios) appData.expo.ios = {};
appData.expo.ios.buildNumber = String(newVersionCode);

fs.writeFileSync(appJsonPath, JSON.stringify(appData, null, 2) + '\n', 'utf8');

pkgData.version = newVersion;
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgData, null, 2) + '\n', 'utf8');

console.log(`✅ [Smart Version Bumper] app.json & package.json berhasil diperbarui secara otomatis!`);
