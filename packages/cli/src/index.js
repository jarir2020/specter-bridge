#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = path.resolve(cliDir, '../..');
const VERSION = '0.1.0';

function usage() {
  return `Specter Bridge ${VERSION}

Usage:
  specter init <app-name> [--app-id com.example.app] [--web-dir dist] [--dir path]
  specter add android
  specter sync android
  specter build android [--release]
  specter run android

Options:
  -h, --help       Show this help
  -v, --version    Show the CLI version`;
}

function fail(message) {
  throw new Error(message);
}

function parseOptions(args, valueOptions = [], allowedFlags = []) {
  const values = {};
  const flags = new Set();
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (argument === '-h' || argument === '--help') {
      flags.add('help');
    } else if (argument === '-v' || argument === '--version') {
      flags.add('version');
    } else if (allowedFlags.includes(argument)) {
      flags.add(argument.slice(2));
    } else if (valueOptions.includes(argument)) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) fail(`Missing value after ${argument}.`);
      values[argument.slice(2)] = args[++index];
    } else if (argument.startsWith('-')) {
      fail(`Unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  return { values, flags, positionals };
}

function appSlug(value) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) fail('App name must contain at least one letter or number.');
  return slug;
}

function validateAppId(appId) {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(appId)) {
    fail(`Invalid Android app ID "${appId}". Use lowercase Java package segments, for example com.example.myapp.`);
  }
  return appId;
}

async function loadConfig(projectDir = process.cwd()) {
  const configPath = path.join(projectDir, 'specter.config.json');
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    fail(`Could not read ${configPath}: ${error.message}. Run "specter init" in this app directory first.`);
  }
  if (!config || typeof config.appId !== 'string' || typeof config.appName !== 'string' || typeof config.webDir !== 'string') {
    fail(`${configPath} is missing appId, appName, or webDir.`);
  }
  validateAppId(config.appId);
  return config;
}

function localOrRegistryDependency(packagePath, fromDirectory = process.cwd()) {
  if (!existsSync(path.join(workspaceDir, packagePath, 'package.json'))) return '^0.1.0';
  let relative = path.relative(fromDirectory, path.join(workspaceDir, packagePath)).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return `file:${relative}`;
}

async function init(args) {
  const { values, flags, positionals } = parseOptions(args, ['--app-id', '--web-dir', '--dir']);
  if (flags.has('help')) {
    console.log(usage());
    return;
  }
  if (flags.has('version')) {
    console.log(VERSION);
    return;
  }
  const appName = positionals.join(' ').trim();
  if (!appName) fail(`App name is required.\n\n${usage()}`);
  const slug = appSlug(appName);
  const appId = validateAppId(values['app-id'] ?? `com.example.${slug.replaceAll('-', '_')}`);
  const webDir = values['web-dir'] ?? 'dist';
  if (!webDir || webDir === '.' || path.isAbsolute(webDir) || webDir.split(/[\\/]/).includes('..')) {
    fail('--web-dir must be a non-root relative path inside the app directory.');
  }

  const target = path.resolve(process.cwd(), values.dir ?? slug);
  if (existsSync(target)) fail(`Target already exists: ${target}`);

  await mkdir(target, { recursive: true });
  const dependencies = {
    '@specter-bridge/core': localOrRegistryDependency('packages/core', target),
    '@specter-bridge/plugin-storage': localOrRegistryDependency('packages/plugin-storage', target)
  };
  const cliDependency = localOrRegistryDependency('packages/cli', target);
  const manifest = {
    name: slug,
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'vite --host 0.0.0.0',
      build: 'vite build',
      preview: 'vite preview'
    },
    dependencies,
    devDependencies: {
      '@specter-bridge/cli': cliDependency,
      vite: '^7.1.0'
    }
  };
  const config = {
    appId,
    appName,
    webDir,
    plugins: ['Storage']
  };

  await writeFile(path.join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(target, 'specter.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(path.join(target, '.gitignore'), `node_modules/
${webDir.replaceAll('\\', '/')}/
android/.gradle/
android/local.properties
android/build/
android/app/build/
*.jks
*.keystore
`);
  await writeFile(path.join(target, 'README.md'), `# ${appName}

Web app generated with Specter Bridge.

## Develop the web app

\`\`\`sh
npm install
npm run dev
\`\`\`

## Build and run on Android

\`\`\`sh
npm run build
npx specter add android
npx specter sync android
npx specter run android
\`\`\`

Install Android SDK Platform 35, JDK 17, and Gradle 8.13 through 8.x before building. See \`specter.config.json\` for the app ID and web output directory.
`);
  await writeFile(path.join(target, 'vite.config.js'), `import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: ${JSON.stringify(webDir)} }
});
`);
  await writeFile(path.join(target, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#10131f" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self'; object-src 'none'; base-uri 'self'" />
    <title>${appName.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`);
  await mkdir(path.join(target, 'src'), { recursive: true });
  await writeFile(path.join(target, 'src/main.js'), `import { Storage } from '@specter-bridge/plugin-storage';
import './style.css';

const root = document.querySelector('#app');
const saved = await Storage.get('specter-demo-name');
root.innerHTML = \`
  <section class="card">
    <p class="eyebrow">SPECTER BRIDGE</p>
    <h1>A small web app, ready for Android.</h1>
    <p>The Storage API uses browser storage during web development and app-private storage in the Android app.</p>
    <label for="name">A value to save</label>
    <div class="row">
      <input id="name" value="\${escapeHtml(saved ?? 'Hello from Specter')}" />
      <button id="save">Save</button>
    </div>
    <p id="status" role="status"></p>
  </section>
\`;

document.querySelector('#save').addEventListener('click', async () => {
  const value = document.querySelector('#name').value;
  await Storage.set('specter-demo-name', value);
  document.querySelector('#status').textContent = 'Saved on this device.';
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
`);
  await writeFile(path.join(target, 'src/style.css'), `:root { font-family: system-ui, sans-serif; color: #edf0ff; background: #10131f; font-synthesis: none; }
* { box-sizing: border-box; }
body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
.card { width: min(100%, 520px); padding: 32px; border: 1px solid #30364d; border-radius: 20px; background: #191e2e; box-shadow: 0 24px 90px #0005; }
.eyebrow { color: #9d8cff; font-size: 12px; font-weight: 800; letter-spacing: .18em; }
h1 { margin: 12px 0; font-size: clamp(30px, 7vw, 44px); line-height: 1.05; }
p { color: #b5bdd4; line-height: 1.6; }
label { display: block; margin: 28px 0 8px; font-size: 14px; }
.row { display: flex; gap: 10px; }
input, button { min-height: 46px; border: 0; border-radius: 10px; font: inherit; }
input { flex: 1; min-width: 0; padding: 0 12px; color: #10131f; }
button { padding: 0 18px; color: white; background: #765bff; cursor: pointer; font-weight: 700; }
#status { min-height: 24px; color: #9fe6bd; }
`);

  console.log(`Created ${target}`);
  console.log('\nNext steps:');
  console.log(`  cd ${path.relative(process.cwd(), target) || '.'}`);
  console.log('  npm install');
  console.log('  npm run build');
  console.log('  npx specter add android');
  console.log('  npx specter sync android');
  console.log('  npx specter build android');
}

async function addAndroid() {
  const config = await loadConfig();
  const target = path.resolve(process.cwd(), 'android');
  if (existsSync(target)) fail(`Android project already exists: ${target}`);

  const template = path.join(cliDir, 'templates/android');
  if (!existsSync(template)) fail(`Android template is missing from the installed CLI: ${template}`);
  const packagePath = config.appId.replaceAll('.', '/');
  await copyTemplate(template, target, {
    PACKAGE_NAME: config.appId,
    PACKAGE_PATH: packagePath,
    APP_NAME: config.appName
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  });
  console.log(`Added Android project for ${config.appId}.`);
  console.log('Build the web app, then run "specter sync android".');
}

async function copyTemplate(source, destination, replacements) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const mappedName = entry.name.replaceAll('__package_path__', replacements.PACKAGE_PATH);
    const destinationPath = path.join(destination, mappedName);
    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, destinationPath, replacements);
    } else if (entry.isFile()) {
      let contents = await readFile(sourcePath);
      if (sourcePath.endsWith('.kt') || sourcePath.endsWith('.xml') || sourcePath.endsWith('.gradle') || sourcePath.endsWith('.properties')) {
        let text = contents.toString('utf8');
        for (const [placeholder, value] of Object.entries(replacements)) text = text.replaceAll(placeholder, value);
        contents = Buffer.from(text);
      }
      await writeFile(destinationPath, contents);
    } else {
      fail(`Unsupported Android template entry: ${sourcePath}`);
    }
  }
}

async function syncAndroid() {
  const config = await loadConfig();
  const projectDir = process.cwd();
  const webDir = path.resolve(projectDir, config.webDir);
  const indexPath = path.join(webDir, 'index.html');
  if (!existsSync(webDir) || !(await stat(webDir)).isDirectory()) fail(`Web output directory not found: ${webDir}. Build your web app first.`);
  if (!existsSync(indexPath) || !(await stat(indexPath)).isFile()) fail(`No index.html found in ${webDir}.`);

  const androidRoot = path.join(projectDir, 'android');
  if (!existsSync(androidRoot)) fail('Android platform is missing. Run "specter add android" first.');
  const target = path.join(androidRoot, 'app/src/main/assets/public');
  const actualWebDir = await realpath(webDir);
  await mkdir(target, { recursive: true });
  const actualTarget = await realpath(target);
  const overlaps = (left, right) => {
    const relative = path.relative(left, right);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  };
  if (overlaps(actualWebDir, actualTarget) || overlaps(actualTarget, actualWebDir)) {
    fail(`Web output directory and Android asset directory overlap: ${actualWebDir} and ${actualTarget}`);
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const copied = await copyWebAssets(webDir, target);
  console.log(`Synced ${copied} files from ${path.relative(projectDir, webDir)} to android/app/src/main/assets/public.`);
}

async function copyWebAssets(source, destination) {
  let copied = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      copied += await copyWebAssets(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await cp(sourcePath, destinationPath);
      copied += 1;
    } else {
      fail(`Web output contains an unsupported entry: ${sourcePath}`);
    }
  }
  return copied;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', (error) => reject(new Error(`Could not start ${command}: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${signal ? `from ${signal}` : `with code ${code}`}.`));
    });
  });
}

async function gradleCommand() {
  const androidDir = path.join(process.cwd(), 'android');
  const wrapper = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (existsSync(wrapper)) return { command: wrapper, prefix: [] };
  return { command: process.platform === 'win32' ? 'gradle.bat' : 'gradle', prefix: [] };
}

async function androidSdkPath() {
  const configured = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (configured) return path.resolve(configured);
  const localPropertiesPath = path.join(process.cwd(), 'android/local.properties');
  if (!existsSync(localPropertiesPath)) return null;
  let content;
  try {
    content = await readFile(localPropertiesPath, 'utf8');
  } catch {
    return null;
  }
  const sdkLine = content.split(/\r?\n/).find((line) => /^\s*sdk\.dir\s*=/.test(line));
  if (!sdkLine) return null;
  const value = sdkLine.slice(sdkLine.indexOf('=') + 1).trim().replaceAll('\\:', ':').replaceAll('\\\\', '\\');
  return path.resolve(value);
}

async function verifyAndroidToolchain(command, prefix) {
  const sdk = await androidSdkPath();
  if (!sdk) fail('Android SDK not found. Install it with Android Studio and set ANDROID_HOME/ANDROID_SDK_ROOT, or open the generated Android project in Android Studio first.');
  const androidJar = path.join(sdk, 'platforms/android-35/android.jar');
  if (!existsSync(androidJar)) fail(`Android SDK platform 35 is missing: ${androidJar}. Install Android SDK Platform 35 in Android Studio SDK Manager.`);

  const versionText = await new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, '--version'], { cwd: path.join(process.cwd(), 'android'), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => reject(new Error(`Could not start ${command}: ${error.message}`)));
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`${command} --version exited with code ${code}.`)));
  });
  const match = versionText.match(/Gradle\s+(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) fail(`Could not read the Gradle version from ${command} --version.`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 8 || (major === 8 && minor < 13) || major >= 9) {
    fail(`Found Gradle ${match[1]}.${match[2]}; Specter Bridge requires Gradle 8.13 through 8.x. Install Gradle 8.13 or newer 8.x, or add a compatible Gradle wrapper.`);
  }
}

async function buildAndroid({ release = false } = {}) {
  await loadConfig();
  if (!existsSync(path.join(process.cwd(), 'android/app/build.gradle'))) fail('Android platform is missing. Run "specter add android" first.');
  const { command, prefix } = await gradleCommand();
  await verifyAndroidToolchain(command, prefix);
  const task = release ? 'assembleRelease' : 'assembleDebug';
  await runProcess(command, [...prefix, '--no-daemon', task], { cwd: path.join(process.cwd(), 'android') });
  const apk = release
    ? 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
    : 'android/app/build/outputs/apk/debug/app-debug.apk';
  if (existsSync(path.resolve(apk))) console.log(`APK: ${path.resolve(apk)}`);
}

async function runAndroid() {
  const config = await loadConfig();
  await buildAndroid();
  const sdk = await androidSdkPath();
  const sdkAdb = sdk && path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const adb = sdkAdb && existsSync(sdkAdb) ? sdkAdb : 'adb';
  const devicesOutput = await new Promise((resolve, reject) => {
    const child = spawn(adb, ['devices'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => reject(new Error(`Could not start adb: ${error.message}`)));
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`adb devices exited with code ${code}.`)));
  });
  const devices = devicesOutput.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)).filter((parts) => parts.length >= 2 && parts[1] === 'device');
  if (devices.length !== 1) fail(`Expected exactly one online Android device or emulator; found ${devices.length}. Start one and retry.`);

  const deviceId = devices[0][0];
  const apk = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
  if (!existsSync(apk)) fail(`Debug APK not found: ${apk}`);
  await runProcess(adb, ['-s', deviceId, 'install', '-r', apk]);
  await runProcess(adb, ['-s', deviceId, 'shell', 'monkey', '-p', config.appId, '1']);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }
  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return;
  }
  if (command === 'init') return init(args);

  const { flags, positionals } = parseOptions(args, [], command === 'build' ? ['--release'] : []);
  if (flags.has('help')) {
    console.log(usage());
    return;
  }
  const platform = positionals[0];
  if (!platform) fail(`Platform is required.\n\n${usage()}`);
  if (platform !== 'android') fail(`Platform "${platform}" is not available yet. Specter Bridge currently supports Android only.`);

  if (command === 'add') return addAndroid();
  if (command === 'sync') return syncAndroid();
  if (command === 'build') return buildAndroid({ release: flags.has('release') });
  if (command === 'run') {
    if (flags.has('release')) fail('Run currently installs the debug build. Use "specter build android --release" to create an unsigned release APK.');
    return runAndroid();
  }
  fail(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  console.error(`specter: ${error.message}`);
  process.exitCode = 1;
});
