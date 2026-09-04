#!/usr/bin/env python3
"""日本語の折り返しを文節単位にする（Safari対応）。

CSSの `word-break: auto-phrase` はChrome系だけの機能で、iOS Safariでは効かない。
そのままだと「記録し続けてい／る」「思わぬ価／格」のように語の途中で改行される。

そこで BudouX で文節を判定し、区切りに <wbr> を差し込む。
CSS側で `word-break: keep-all` を当てると、日本語は <wbr> の位置でしか折れなくなる。
この組み合わせは Safari / Chrome / Firefox のいずれでも動く。

    pip install budoux
    python scripts/wrap-japanese-phrases.py public/kin-kaitori-3sha/index.html

同じファイルに繰り返しかけても二重に入らない（既存の <wbr> は先に取り除く）。
本文を書き換えたら、もう一度かけ直すこと。
"""

import re
import sys
from pathlib import Path

import budoux

# 中身を触らないタグ。スクリプトや構造化データを壊さないため。
SKIP_TAGS = {"script", "style", "title", "textarea", "svg", "code", "pre"}

# 文節を割りたくない属性値の中（alt など）は対象外にする。
TAG_RE = re.compile(r"<(/?)([a-zA-Z0-9]+)([^>]*)>")

parser = budoux.load_default_japanese_parser()

# ひらがな・カタカナ・漢字が含まれるときだけ処理する
JA_RE = re.compile(r"[぀-ヿ一-鿿]")


def split_phrases(text: str) -> str:
    """文節の切れ目に <wbr> を入れる。前後の空白は保つ。"""
    if not JA_RE.search(text):
        return text

    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    core = text.strip()
    if not core:
        return text

    chunks = parser.parse(core)
    if len(chunks) <= 1:
        return text
    return lead + "<wbr>".join(chunks) + trail


def process(html: str) -> tuple[str, int]:
    # 二重適用を防ぐため、まず既存の <wbr> を落とす
    html = html.replace("<wbr>", "")

    out = []
    pos = 0
    skip_depth = 0
    skip_tag = None
    count = 0

    for m in TAG_RE.finditer(html):
        text = html[pos:m.start()]
        if text:
            if skip_depth == 0:
                new = split_phrases(text)
                if new != text:
                    count += 1
                out.append(new)
            else:
                out.append(text)

        closing, tag, _attrs = m.group(1), m.group(2).lower(), m.group(3)
        if tag in SKIP_TAGS:
            if closing:
                if skip_tag == tag and skip_depth > 0:
                    skip_depth -= 1
                    if skip_depth == 0:
                        skip_tag = None
            else:
                skip_depth += 1
                skip_tag = tag

        out.append(m.group(0))
        pos = m.end()

    tail = html[pos:]
    if tail:
        out.append(split_phrases(tail) if skip_depth == 0 else tail)

    return "".join(out), count


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    for arg in sys.argv[1:]:
        path = Path(arg)
        if not path.exists():
            print(f"見つかりません: {path}", file=sys.stderr)
            return 1
        src = path.read_text(encoding="utf-8")
        out, n = process(src)
        path.write_text(out, encoding="utf-8")
        added = out.count("<wbr>")
        print(f"{path}: {n}箇所のテキストを文節分割（<wbr> {added}個）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
