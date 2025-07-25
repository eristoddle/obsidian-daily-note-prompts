#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Get version from command line argument
const newVersion = process.argv[2];

if (!newVersion) {
  error('Please provide a version number: npm run release 1.0.0');
}

// Validate version format
const versionRegex = /^\d+\.\d+\.\d+$/;
if (!versionRegex.test(newVersion)) {
  error('Version must be in format x.y.z (e.g., 1.0.0)');
}

info(`Starting release process for version ${newVersion}`);

try {
  // Check if working directory is clean
  try {
    execSync('git diff-index --quiet HEAD --', { stdio: 'ignore' });
  } catch (e) {
    error('Working directory is not clean. Please commit or stash your changes.');
  }

  // Update package.json
  info('Updating package.json...');
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  success('Updated package.json');

  // Update manifest.json
  info('Updating manifest.json...');
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
  success('Updated manifest.json');

  // Update versions.json
  info('Updating versions.json...');
  const versionsPath = path.join(__dirname, '..', 'versions.json');
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  versions[newVersion] = manifest.minAppVersion;
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, '\t') + '\n');
  success('Updated versions.json');

  // Build the plugin
  info('Building plugin...');
  execSync('npm run build', { stdio: 'inherit' });
  success('Plugin built successfully');

  // Run tests if they exist
  try {
    execSync('npm test', { stdio: 'inherit' });
    success('Tests passed');
  } catch (e) {
    warning('No tests found or tests failed - continuing with release');
  }

  // Commit changes
  info('Committing changes...');
  execSync(`git add package.json manifest.json versions.json`, { stdio: 'inherit' });
  execSync(`git commit -m "Release version ${newVersion}"`, { stdio: 'inherit' });
  success('Changes committed');

  // Create and push tag
  info('Creating and pushing tag...');
  execSync(`git tag ${newVersion}`, { stdio: 'inherit' });
  execSync(`git push origin ${newVersion}`, { stdio: 'inherit' });
  execSync(`git push`, { stdio: 'inherit' });
  success('Tag created and pushed');

  success(`🎉 Release ${newVersion} completed successfully!`);
  info('GitHub Actions will now build and create the release automatically.');
  info(`Check the release at: https://github.com/YOUR_USERNAME/obsidian-daily-prompts/releases/tag/${newVersion}`);

} catch (error) {
  error(`Release failed: ${error.message}`);
}