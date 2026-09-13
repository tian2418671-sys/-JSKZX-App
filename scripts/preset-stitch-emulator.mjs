/**
 * Android emulator E2E test for the mobile preset stitch flow.
 *
 * Usage:
 *   node scripts/preset-stitch-emulator.mjs
 *
 * The app WebView exposes no useful accessibility nodes on the test image, so
 * this driver uses stable app layout anchors and native SAF text bounds. Every
 * step writes a screenshot under shots/preset-stitch-emulator/.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const adb = process.env.ADB || 'E:\\AndroidSDK\\platform-tools\\adb.exe';
const serial = process.env.ADB_SERIAL || 'emulator-5554';
const packageName = 'com.sillytavern.cardmanager.android';
const activity = `${packageName}/.MainActivity`;
const remoteDir = '/sdcard/Documents/ImportSource';
const artifactDir = join(root, 'shots', 'preset-stitch-emulator');
const xmlPath = join(artifactDir, 'window.xml');

mkdirSync(artifactDir, { recursive: true });

function adbRun(args, options = {}) {
    const result = spawnSync(adb, ['-s', serial, ...args], {
        cwd: root,
        encoding: options.encoding || 'utf8',
        timeout: options.timeout || 30_000,
        maxBuffer: 8 * 1024 * 1024
    });
    if (result.error) throw result.error;
    if (options.check !== false && result.status !== 0) {
        throw new Error(`adb ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
    }
    return result.stdout || '';
}

function sleep(ms) {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function logStep(label) {
    console.log(`\n[${new Date().toISOString()}] ${label}`);
}

function screenshot(name) {
    const file = join(artifactDir, `${name}.png`);
    const result = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], {
        encoding: 'buffer',
        timeout: 15_000
    });
    if (result.status !== 0) throw new Error(`screenshot failed: ${result.stderr}`);
    writeFileSync(file, result.stdout);
    console.log(`  screenshot: ${file}`);
}

function tap(x, y) {
    console.log(`  tap ${x},${y}`);
    adbRun(['shell', 'input', 'tap', String(x), String(y)]);
}

function dumpUi() {
    adbRun(['shell', 'uiautomator', 'dump', '--compressed', '/sdcard/window.xml']);
    adbRun(['pull', '/sdcard/window.xml', xmlPath]);
    return readFileSync(xmlPath, 'utf8');
}

function nativeTextNodes(xml) {
    const nodes = [];
    const nodeRe = /<node\b[^>]*\btext="([^"]*)"[^>]*\bbounds="\[([^\]]+)\]\[([^\]]+)\]"[^>]*>/g;
    for (const match of xml.matchAll(nodeRe)) {
        const [, text, leftTop, rightBottom] = match;
        const [left, top] = leftTop.split(',').map(Number);
        const [right, bottom] = rightBottom.split(',').map(Number);
        if (text) nodes.push({ text, x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) });
    }
    return nodes;
}

async function tapNativeText(labels, options = {}) {
    const expected = Array.isArray(labels) ? labels : [labels];
    const deadline = Date.now() + (options.timeout || 8_000);
    while (Date.now() < deadline) {
        const nodes = nativeTextNodes(dumpUi());
        const node = nodes.find((item) => expected.some((label) =>
            options.exact ? item.text === label : item.text.includes(label)));
        if (node) {
            console.log(`  native "${node.text}" at ${node.x},${node.y}`);
            tap(node.x, node.y);
            return node.text;
        }
        await sleep(250);
    }
    throw new Error(`native text not found: ${expected.join(' / ')}`);
}

function assertForeground() {
    const focus = adbRun(['shell', 'dumpsys', 'activity', 'activities']);
    if (!focus.includes(packageName)) throw new Error('app is not the foreground activity');
}

function prepareFixtures() {
    const fixtures = [
        {
            file: 'StitchBase.json',
            data: {
                name: 'StitchBase',
                temperature: 0.7,
                prompts: [
                    { identifier: 'main', name: 'Main', role: 'system', content: 'base prompt', enabled: true }
                ],
                prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }]
            }
        },
        {
            file: 'StitchSource.json',
            data: {
                name: 'StitchSource',
                temperature: 0.9,
                prompts: [
                    { identifier: 'source_only', name: 'Source only', role: 'system', content: 'stitched prompt', enabled: true }
                ],
                prompt_order: [{ character_id: 100001, order: [{ identifier: 'source_only', enabled: true }] }]
            }
        }
    ];
    adbRun(['shell', 'mkdir', '-p', remoteDir]);
    for (const fixture of fixtures) {
        const local = join(artifactDir, fixture.file);
        writeFileSync(local, JSON.stringify(fixture.data, null, 2), 'utf8');
        adbRun(['push', local, `${remoteDir}/${fixture.file}`]);
    }
}

function verifyOutput() {
    const listing = adbRun(['shell', 'find', remoteDir, '-maxdepth', '1', '-name', '缝合_*.json'], { check: false });
    const output = listing.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (!output) throw new Error(`no stitched JSON found in ${remoteDir}`);
    const json = adbRun(['exec-out', 'cat', output]);
    const parsed = JSON.parse(json);
    const identifiers = new Set((parsed.prompts || []).map((prompt) => prompt.identifier));
    const ordered = (parsed.prompt_order?.[0]?.order || []).map((item) => item.identifier);
    if (!identifiers.has('source_only') || !ordered.includes('source_only')) {
        throw new Error(`stitched output is missing source_only: ${output}`);
    }
    console.log(`  verified output: ${output}`);
    console.log(`  prompt identifiers: ${[...identifiers].join(', ')}`);
}

async function main() {
    if (!existsSync(adb)) console.warn(`ADB path does not exist: ${adb}; relying on PATH if available`);
    logStep('Check emulator and prepare real preset fixtures');
    adbRun(['get-state']);
    // Keep the emulator test deterministic: app state is disposable, fixture files are not.
    adbRun(['shell', 'pm', 'clear', packageName]);
    prepareFixtures();

    logStep('Launch app and open Presets');
    adbRun(['shell', 'am', 'start', '-n', activity]);
    await sleep(1_500);
    assertForeground();
    screenshot('01-library-before-presets');
    await sleep(3_000);
    // The tab is idempotent; repeat after cold-start rendering settles.
    for (let attempt = 0; attempt < 3; attempt++) {
        tap(680, 2_260);
        await sleep(2_000);
    }
    screenshot('02-presets-empty');

    logStep('Choose the seeded SAF directory');
    tap(540, 995);
    await sleep(1_000);
    const pickerXml = dumpUi();
    if (pickerXml.includes('USE THIS FOLDER')) {
        tapNativeText('USE THIS FOLDER', { exact: true });
    } else {
        await tapNativeText(['ImportSource', '进口源'], { timeout: 5_000 });
        await tapNativeText(['USE THIS FOLDER', '使用此文件夹'], { exact: false });
    }
    // Android 15 asks for a second confirmation after the SAF folder selection.
    await sleep(500);
    const permissionXml = dumpUi();
    if (permissionXml.includes('ALLOW') || permissionXml.includes('允许')) {
        await tapNativeText(['ALLOW', '允许'], { exact: false });
    }
    // SAF tree scans are intentionally serialized and can take several seconds on the emulator.
    await sleep(8_000);
    screenshot('03-presets-scanned');

    logStep('Open stitch center');
    tap(590, 320);
    await sleep(700);
    screenshot('04-stitch-step-1');

    logStep('Select source preset and advance through the wizard');
    tap(950, 1_575); // Step 1 -> Step 2
    await sleep(500);
    screenshot('05-stitch-step-2');
    tap(90, 1_220); // StitchSource checkbox
    tap(920, 1_475); // Step 2 -> Step 3
    await sleep(500);
    screenshot('06-stitch-step-3');
    tap(960, 890); // add all source entries
    tap(950, 1_205); // Step 3 -> Step 4
    await sleep(500);
    screenshot('07-stitch-step-4');
    tap(970, 1_150); // Step 4 -> Step 5
    await sleep(500);
    screenshot('08-stitch-preview');
    tap(880, 1_950); // execute
    await sleep(3_000);
    assertForeground();
    screenshot('09-stitch-complete');

    logStep('Verify stitched JSON was persisted and contains the source prompt');
    verifyOutput();
    console.log('\nPASS: open presets -> select source -> stage entry -> execute stitch');
}

main().catch((error) => {
    console.error(`\nFAIL: ${error.stack || error.message}`);
    try { screenshot('failure'); } catch { /* preserve original failure */ }
    process.exitCode = 1;
});