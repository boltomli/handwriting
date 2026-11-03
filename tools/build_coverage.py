#!/usr/bin/env python3
"""从 webfonts/*.woff2 提取字表，生成 coverage.js（供浏览器做精确缺字检测）。

SPDX-License-Identifier: MIT
（本脚本是 MIT；生成的 coverage.js 属字体派生数据，为 SIL OFL-1.1）

输出格式（每个码位 1 bit，base64 编码）：
    window.GP_COV = { main: "<base64>", extra: "<base64>" };

用法：.venv/Scripts/python.exe tools/build_coverage.py
"""
import base64
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = {
    "main": ROOT / "webfonts" / "MiorningGoupaHei-Regular.woff2",
    "extra": ROOT / "webfonts" / "MiorningGoupaHeiExtra-Regular.woff2",
}
OUT = ROOT / "coverage.js"


def codepoints(path: Path) -> set[int]:
    return set(TTFont(path).getBestCmap().keys())


def to_bitmap(cps: set[int], top: int) -> bytes:
    buf = bytearray(top // 8 + 1)
    for cp in cps:
        buf[cp >> 3] |= 1 << (cp & 7)
    return bytes(buf)


def main() -> None:
    sets = {k: codepoints(p) for k, p in FONTS.items()}
    top = max(max(s) for s in sets.values())
    overlap = sets["main"] & sets["extra"]
    if overlap:
        print(f"提示：主库与补充库有 {len(overlap)} 个重叠码位")

    parts = []
    for key in ("main", "extra"):
        b64 = base64.b64encode(to_bitmap(sets[key], top)).decode()
        parts.append(f'{key}:"{b64}"')

    header = (
        "/* 由 tools/build_coverage.py 从字体文件提取，勿手改。\n"
        "   SPDX-License-Identifier: OFL-1.1（狗爬黑字体派生数据，可商用）\n"
        f"   main={len(sets['main'])} extra={len(sets['extra'])} "
        f"union={len(sets['main'] | sets['extra'])} max=U+{top:04X} */\n"
    )
    OUT.write_text(header + "window.GP_COV={" + ",".join(parts) + "};\n", encoding="utf-8")
    print(f"已生成 {OUT}（{OUT.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
