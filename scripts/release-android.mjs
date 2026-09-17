/**
 * Android 发布一条龙:清理 → 构建 → 同步 → 出包 → 校验 → (可选)上传
 *
 * 背景:曾发生「发布包不含新功能」事故——构建输出目录(web/、android .../assets/public)
 * 未被真正清空,历史分块持续累积(单次累积 345 个文件),导致打包时把旧的 index.html
 * 入口一并塞进 APK,用户装到的是旧版本,且体积无谓膨胀近一倍。
 *
 * 因此本脚本把「清理」和「产物校验」固化为发布的前置/后置硬门槛:
 *   前置:强制删除两个输出目录,杜绝陈旧产物混入
 *   后置:①入口一致性 ②分块集一致性 ③关键功能特征 ④签名 ⑤体积/哈希
 *
 * 用法:
 *   node scripts/release-android.mjs            # 构建 + 校验
 *   node scripts/release-android.mjs --upload   # 构建 + 校验 + 上传到 GitHub Release
 *   node scripts/release-android.mjs --skip-build --upload   # 只校验现有包并上传
 *
 * 归属:package.json 的 release:android 命令。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cleanBuildOutputs, cleanupTrash, WEB_DIR, PUBLIC_DIR } from './clean-build-outputs.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const UPLOAD = argv.includes('--upload');
const SKIP_BUILD = argv.includes('--skip-build');

const APK_PATH = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const METADATA_PATH = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'output-metadata.json');
const REPO = 'tian2418671-sys/-JSKZX-App';

/**
 * 关键功能特征:必须能在 APK 的某个 JS 分块里找到。
 * 用「用户可见的中文字符串字面量」而非函数名——压缩混淆会改名,但字符串会保留。
 * 新增功能时在此登记,漏登记不会报错,但登记了却没找到 = 功能没打进包,直接失败。
 */
const FEATURE_MARKERS = [
    { key: '预设缝合', marker: '缝合' },
    { key: '内容指纹查重', marker: '内容指纹' },
    { key: '世界书', marker: '世界书' },
    { key: 'MVU 变量', marker: 'MVU' },
    { key: '测卡记忆 v4.1', marker: '记忆表格' },
    { key: '扫描读取修复', marker: '无法解析或超限' }
];

/** 体积上限(MB):超过视为异常(通常是陈旧产物混入) */
const MAX_APK_MB = 12;

const log = (msg) => console.log(`[release] ${msg}`);
const die = (msg) => {
    console.error(`\n❌ [release] ${msg}\n`);
    process.exit(1);
};

function run(cmd, cwd = root) {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function listJsChunks(dir) {
    const assets = join(dir, 'assets');
    if (!existsSync(assets)) return [];
    return readdirSync(assets).filter((f) => f.endsWith('.js')).sort();
}

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

// ---------------------------------------------------------------- 前置:清理

function cleanOutputs() {
    log('① 清理构建输出目录(防陈旧产物混入)');
    // 具体实现见 clean-build-outputs.mjs:带重试 + 重命名兜底。
    // 注意:写入输出目录的 rmSync 会因句柄占用而「静默失败」,这里必须拿到结果判定,
    // 否则就会重演「陈旧分块被打包进 APK」的事故。
    const res = cleanBuildOutputs({ verbose: false });
    for (const dir of res.cleaned) log(`   已清理 ${dir}`);
    for (const dir of res.trashed) log(`   已腾挪(被占用无法删除) → ${dir}`);
    if (res.failed.length) {
        die(`目录清理失败(无法删除也无法重命名):${res.failed.join(', ')}`);
    }
    if (!res.cleaned.length && !res.trashed.length) log('   无需清理');
    return res.trashed;
}

// ---------------------------------------------------------------- 构建 / 出包

function buildAndPackage() {
    log('② 构建 web 产物');
    run('npm run build:web');

    log('③ 同步到 Android 工程');
    run('npx cap sync android');
    run('node scripts/post-cap-sync.mjs');

    log('③.5 校验同步完整性(分块集必须与 web 产出一致)');
    const webChunks = listJsChunks(WEB_DIR);
    const pubChunks = listJsChunks(PUBLIC_DIR);
    if (webChunks.length !== pubChunks.length) {
        die(
            `同步后分块数不一致:web=${webChunks.length},android assets/public=${pubChunks.length}\n` +
                `   说明有陈旧分块残留(或同步不完整),禁止出包。\n` +
                `   web 独有:${webChunks.filter((c) => !pubChunks.includes(c)).join(', ') || '无'}\n` +
                `   多余:${pubChunks.filter((c) => !webChunks.includes(c)).join(', ') || '无'}`
        );
    }
    log(`   ✓ 分块数一致(${webChunks.length} 个)`);

    log('④ 编译 release APK');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    run(`${gradlew} assembleRelease --console=plain`, join(root, 'android'));
}

// ---------------------------------------------------------------- 后置:校验

function verifyApk() {
    if (!existsSync(APK_PATH)) die(`未找到 APK:${APK_PATH}`);

    log('⑤ 校验产物');

    // Node 无内置 zip 读取能力,产物校验交给 scripts/apk-inspect.py(输出单行 JSON)
    const python = findPython();
    if (!python) die('未找到 python,无法校验 APK 产物。请安装 Python 3 后重试。');
    const inspector = join(root, 'scripts', 'apk-inspect.py');
    if (!existsSync(inspector)) die(`缺少校验辅助脚本:${inspector}`);

    // 特征串经 Windows 命令行传递时会被代码页破坏(ASCII 正常、中文乱码),
    // 因此统一用 base64 传参;apk-inspect.py 侧以 b64: 前缀还原。
    const markerArgs = FEATURE_MARKERS.map(
        (f) => `b64:${Buffer.from(f.marker, 'utf-8').toString('base64')}`
    ).join(' ');
    const raw = execSync(`"${python}" "${inspector}" "${APK_PATH}" ${markerArgs}`, {
        encoding: 'utf-8',
        shell: true,
        // 强制 Python 以 UTF-8 交互,避免 Windows 代码页介入(stderr 提示也能正常显示)
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    const info = JSON.parse(raw.trim().split('\n').pop());

    // ① 入口一致性
    if (!info.entry) die('APK 内 index.html 未找到入口脚本引用');
    if (!info.entry_present) die(`APK 内缺少 index.html 引用的入口文件:${info.entry}`);
    log(`   ✓ 入口一致:${info.entry}`);

    // ② 分块集一致性:web 产出与 Android 工程必须完全一致
    // 这是「陈旧产物混入」的直接指纹。正常流程中已由清理步骤保证,此处作为兜底:
    // 手工 build/手工 sync 后忘记清理时,这条会拦住带陈旧产物的包。
    const webChunks = listJsChunks(WEB_DIR);
    const pubChunks = listJsChunks(PUBLIC_DIR);
    if (webChunks.length && pubChunks.length) {
        const extra = pubChunks.filter((c) => !webChunks.includes(c));
        const lost = webChunks.filter((c) => !pubChunks.includes(c));
        if (extra.length || lost.length) {
            const brief = (arr) => arr.slice(0, 5).join(', ') + (arr.length > 5 ? ' …' : '');
            die(
                `Android 资源目录与 web 产出一致性校验失败:\n` +
                    `   多余(陈旧)分块 ${extra.length} 个:${brief(extra)}\n` +
                    `   缺失分块 ${lost.length} 个:${brief(lost)}\n` +
                    `   说明有陈旧产物未清理,禁止发布。请重新执行完整发布流程。`
            );
        }
        log(`   ✓ 资源目录无陈旧产物(web 与 android 各 ${pubChunks.length} 个分块)`);
    }

    // ③ 关键功能特征
    const missing = FEATURE_MARKERS.filter((f) => !info.markers[f.marker]).map((f) => f.key);
    if (missing.length) {
        die(
            `APK 缺少关键功能代码:${missing.join('、')}\n` +
                `   这通常意味着打包用的是陈旧产物,请勿发布此包。`
        );
    }
    log(`   ✓ 关键功能齐备:${FEATURE_MARKERS.map((f) => f.key).join('、')}(共 ${info.js_count} 个分块)`);

    // ③.5 Gradle 资源源目录洁净度
    // Gradle 会把 android/app/src/main/assets/ 下的一切打进 APK,
    // 清理残留若落在这里(如重命名腾挪出来的 public.__stale_*)会被整体打包,导致体积反弹。
    const assetsRoot = join(root, 'android', 'app', 'src', 'main', 'assets');
    const strays = readdirSync(assetsRoot).filter((n) => n.includes('__stale_'));
    if (strays.length) {
        die(
            `Gradle 资源源目录混入清理残留:${strays.join(', ')}\n` +
                `   这些残留会被整体打包进 APK,请先移出 ${assetsRoot}。`
        );
    }
    log('   ✓ 资源源目录无清理残留');

    // ④ 签名
    const apksigner = findApksigner();
    if (apksigner) {
        const certs = execSync(`"${apksigner}" verify --print-certs "${APK_PATH}"`, { encoding: 'utf-8', shell: true });
        const dn = (certs.match(/DN:\s*(.+)/) || [])[1];
        if (!dn) die('APK 签名校验失败:未读到证书 DN');
        if (!/JSKZX/i.test(dn)) die(`APK 签名证书异常:${dn}\n   期望包含 JSKZX 的正式发布证书。`);
        log(`   ✓ 已签名:${dn.trim()}`);
    } else {
        log('   ⚠ 未找到 apksigner,跳过签名校验');
    }

    // ⑤ 体积 / 版本 / 哈希
    const sizeMb = statSync(APK_PATH).size / 1024 / 1024;
    if (sizeMb > MAX_APK_MB) die(`APK 体积异常:${sizeMb.toFixed(2)} MB > 上限 ${MAX_APK_MB} MB(疑似陈旧产物混入)`);
    let ver = 'unknown';
    try {
        const meta = JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));
        ver = `versionName ${meta.elements[0].versionName} (code ${meta.elements[0].versionCode})`;
    } catch (e) {
        /* 元数据可选 */
    }
    const hash = sha256(APK_PATH);
    log(`   ✓ 体积:${sizeMb.toFixed(2)} MB`);
    log(`   ✓ 版本:${ver}`);
    const tag = `v${(ver.match(/versionName (\S+)/) || [])[1] || ''}`;
    return { sizeMb, hash, tag };
}

function findPython() {
    for (const cmd of ['python', 'py -3', 'python3']) {
        try {
            execSync(`${cmd} --version`, { stdio: 'ignore', shell: true });
            return cmd;
        } catch (e) {
            /* 试下一个 */
        }
    }
    return null;
}

function findApksigner() {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    const candidates = [];
    if (sdk) {
        const bt = join(sdk, 'build-tools');
        if (existsSync(bt)) {
            for (const v of readdirSync(bt).sort().reverse()) {
                candidates.push(join(bt, v, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'));
            }
        }
    }
    // 项目内本地 SDK(本仓库把 android-sdk 放在项目根,但已 gitignore)
    const localBt = join(root, 'android-sdk', 'build-tools');
    if (existsSync(localBt)) {
        for (const v of readdirSync(localBt).sort().reverse()) {
            candidates.push(join(localBt, v, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'));
        }
    }
    // 已知回退路径
    candidates.push('E:\\AndroidSDK\\build-tools\\35.0.0\\apksigner.bat');
    return candidates.find((c) => c && existsSync(c)) || null;
}

// ---------------------------------------------------------------- 上传

function uploadToRelease(tag, hash) {
    log('⑥ 上传到 GitHub Release');

    let remoteDigest = null;
    try {
        const view = execSync(`gh release view ${tag} --json assets`, { encoding: 'utf-8', shell: true });
        const assets = JSON.parse(view).assets || [];
        remoteDigest = assets[0]?.digest?.replace('sha256:', '') || null;
    } catch (e) {
        // Release 不存在 → 走创建分支
    }

    if (remoteDigest === hash) {
        log(`   ✓ 远端附件哈希一致,无需重复上传`);
        return;
    }

    if (remoteDigest) {
        execSync(`gh release delete-asset ${tag} app-release.apk --yes`, { cwd: root, stdio: 'inherit', shell: true });
    }

    const exists = (() => {
        try {
            execSync(`gh release view ${tag} --json tagName`, { stdio: 'ignore', shell: true });
            return true;
        } catch (e) {
            return false;
        }
    })();

    if (exists) {
        run(`gh release upload ${tag} "${APK_PATH}#JSKZX-${tag}.apk"`);
        log(`   ✓ 已替换 ${tag} 的 release 附件`);
    } else {
        run(`gh release create ${tag} "${APK_PATH}#JSKZX-${tag}.apk" --title "${tag}" --target main-v1.10`);
        log(`   ✓ 已创建 ${tag} 并上传附件`);
    }
}

// ---------------------------------------------------------------- main

function main() {
    log(`Android 发布一条龙${UPLOAD ? '(含上传)' : ''}`);
    console.log('');

    let trashed = [];
    if (!SKIP_BUILD) {
        trashed = cleanOutputs();
        buildAndPackage();
    } else {
        log('① - ④ 跳过构建(--skip-build)');
    }

    const { sizeMb, hash, tag } = verifyApk();

    // 流程末尾回收腾挪出来的目录(此时占用句柄通常已释放)
    if (trashed.length) cleanupTrash(trashed);

    console.log('');
    log('────────────────────────────────────────');
    log(`产物:${APK_PATH}`);
    log(`版本:${tag}`);
    log(`体积:${sizeMb.toFixed(2)} MB`);
    log(`哈希:${hash}`);
    log('────────────────────────────────────────');

    if (UPLOAD) {
        uploadToRelease(tag, hash);
    } else {
        log('提示:加 --upload 可直接上传到 GitHub Release');
    }

    console.log('');
    log('✅ 发布流程完成');
}

main();
