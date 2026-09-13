#!/usr/bin/env python3
"""APK 产物校验辅助脚本。

读取 APK 内的构建产物信息,供发布脚本做「发布前硬校验」使用。
背景:曾发生发布包不含新功能的事故——构建输出目录未清空,陈旧分块被一起打包,
导致 APK 内 index.html 指向旧入口。此脚本用于在发布前发现这类问题。

用法:
    python scripts/apk-inspect.py <apk路径> [特征 ...]

特征参数的两种写法:
    b64:<base64>    UTF-8 特征串的 base64 编码（推荐,规避 Windows 命令行代码页破坏中文）
    plain:<文本>    明文特征串（仅限纯 ASCII,如 MVU）

输出(单行 JSON,便于 Node 端解析):
    {
      "entry": "index-xxx.js",        # APK 内 index.html 引用的入口脚本
      "entry_present": true,          # 该入口文件是否真的存在于 APK 内
      "js_count": 27,                 # APK 内 JS 分块总数
      "markers": {"缝合": true}       # 各特征字符串是否能在某个分块中命中
    }

退出码:0 正常;2 参数错误或读取失败。
"""
import base64
import json
import re
import sys
import zipfile

PUBLIC_PREFIX = 'assets/public/'
INDEX_HTML = 'assets/public/index.html'
ENTRY_RE = re.compile(r'assets/(index-[A-Za-z0-9_-]+\.js)')


def parse_feature(arg):
    """解析特征参数:支持 b64: 与 plain: 两种前缀。"""
    if arg.startswith('b64:'):
        return base64.b64decode(arg[4:]).decode('utf-8')
    if arg.startswith('plain:'):
        return arg[6:]
    return arg


def inspect(apk_path, markers):
    with zipfile.ZipFile(apk_path) as z:
        names = z.namelist()
        html = z.read(INDEX_HTML).decode('utf-8', 'ignore')

        match = ENTRY_RE.search(html)
        entry = match.group(1) if match else None

        js_names = [n for n in names if n.startswith(PUBLIC_PREFIX) and n.endswith('.js')]
        blobs = []
        for name in js_names:
            try:
                blobs.append(z.read(name).decode('utf-8', 'ignore'))
            except Exception:
                # 单个分块解压失败不应中断整体校验
                pass
        blob = '\n'.join(blobs)

    return {
        'entry': entry,
        'entry_present': bool(entry) and (PUBLIC_PREFIX + 'assets/' + entry) in names,
        'js_count': len(js_names),
        'markers': {mk: (mk in blob) for mk in markers},
    }


def main():
    if len(sys.argv) < 2:
        print('usage: apk-inspect.py <apk> [b64:<base64> | plain:<text> ...]', file=sys.stderr)
        return 2

    apk_path = sys.argv[1]
    markers = [parse_feature(a) for a in sys.argv[2:]]

    try:
        result = inspect(apk_path, markers)
    except Exception as exc:
        print('inspect failed: %s' % exc, file=sys.stderr)
        return 2

    # ⚠ 必须保持 ensure_ascii=True(默认):Windows 下 Python 输出到管道时使用本地代码页
    # (中文系统为 GBK),而 Node 按 UTF-8 解码 —— 直接输出中文会让 JSON 键变成乱码,
    # 导致特征.匹配永远失败。转义为 \uXXXX 后是纯 ASCII,跨编码安全。
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
