#!/usr/bin/env node

/**
 * WuzzChat Mobile Version Bumper Script
 * Otomatis memperbarui version (semver) dan build number (versionCode & buildNumber)
 * di app.json dan package.json.
 * 
 * Penggunaan:
 *   node scripts/bump-version.js patch  (1.0.0 -> 1.0.1, build +1)
 *   node scripts/bump-version.js minor  (1.0.0 -> 1.1.0, build +1)
 *   node scripts/bump-version.js major  (1.0.0 -> 2.0.0, build +1)
 *   node scripts/bump-version.js build  (versi tetap, build +1)
 */

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const pkgJsonPath = path.join(__dirname, '..', 'package.json');

const bumpType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major', 'build'].includes(bumpType)) {
  console.error(`❌ Tipe bump tidak valid: "${bumpType}". Gunakan salah satu dari: patch, minor, major, build.`);
  process.exit(1);
}

// 1. Baca app.json
const appRaw = fs.readFileSync(appJsonPath, 'utf8');
const appData = JSON.parse(appRaw);

// 2. Baca package.json
const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf8');
const pkgData = JSON.parse(pkgRaw);

const oldVersion = appData.expo.version || '1.0.0';
const oldVersionCode = appData.expo.android?.versionCode || 1;

let [major, minor, patch] = oldVersion.split('.').map(Number);
if (isNaN(major)) major = 1;
if (isNaN(minor)) minor = 0;
if (isNaN(patch)) patch = 0;

let newVersion = oldVersion;
const newVersionCode = oldVersionCode + 1;

if (bumpType === 'patch') {
  patch += 1;
  newVersion = `${major}.${minor}.${patch}`;
} else if (bumpType === 'minor') {
  minor += 1;
  patch = 0;
  newVersion = `${major}.${minor}.${patch}`;
} else if (bumpType === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
  newVersion = `${major}.${minor}.${patch}`;
} else if (bumpType === 'build') {
  // Versi semver tetap sama, hanya build number yang naik
  newVersion = oldVersion;
}

// 3. Update app.json
appData.expo.version = newVersion;
if (!appData.expo.android) appData.expo.android = {};
appData.expo.android.versionCode = newVersionCode;

if (!appData.expo.ios) appData.expo.ios = {};
appData.expo.ios.buildNumber = String(newVersionCode);

fs.writeFileSync(appJsonPath, JSON.stringify(appData, null, 2) + '\n', 'utf8');

// 4. Update package.json
pkgData.version = newVersion;
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgData, null, 2) + '\n', 'utf8');

console.log('---------------------------------------------------------');
console.log(`🚀 [WuzzChat Mobile] Version Bumped Successfully! (${bumpType.toUpperCase()})`);
console.log(`   📦 Version: ${oldVersion} ➔ ${newVersion}`);
console.log(`   🔢 Android versionCode: ${oldVersionCode} ➔ ${newVersionCode}`);
console.log(`   🍎 iOS buildNumber: "${oldVersionCode}" ➔ "${newVersionCode}"`);
console.log('---------------------------------------------------------');
