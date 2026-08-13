"""Google Ads の管理画面CSVエクスポートを取り込む。

なぜAPIより先にCSVなのか:
Google Ads API は Developer Token の審査が必要で、申請から利用開始まで時間がかかる。
一方、管理画面からのレポートCSVエクスポートは今日から使える。
実績データさえ入れば意思決定エンジンは動くので、CSVを一次経路、APIを高速化手段と位置づける。

Google Ads のCSVは
  - 先頭に「レポート名」「期間」などのプリアンブル行が入る
  - UTF-16LE / UTF-8 BOM / Shift_JIS など文字コードが揺れる
  - 「--」「 --」が欠損値、数値に桁区切りと通貨記号が入る
  - 末尾に合計行（"合計: ..." / "Total: ..."）が付く
ため、素直な csv.DictReader だけでは落ちる。ここで吸収する。
"""
from __future__ import annotations

import csv
import io
import re
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

__all__ = [
    "ImportResult",
    "decode_bytes",
    "parse_number",
    "read_google_ads_csv",
    "import_keyword_report",
    "import_search_term_report",
    "import_approval_csv",
]

_ENCODINGS = ("utf-8-sig", "utf-16", "utf-16-le", "cp932", "utf-8")

# 列名の別名。Google Ads は言語設定で日本語/英語が変わる。
_ALIASES: Dict[str, Sequence[str]] = {
    "date": ("日", "日付", "day", "date"),
    "campaign": ("キャンペーン", "campaign"),
    "ad_group": ("広告グループ", "ad group"),
    "keyword": ("キーワード", "検索キーワード", "keyword", "search keyword"),
    "search_term": ("検索語句", "検索クエリ", "search term", "search query"),
    "match_type": ("マッチタイプ", "キーワードのマッチタイプ", "match type", "keyword match type"),
    "impressions": ("表示回数", "インプレッション", "impressions", "impr.", "impr"),
    "clicks": ("クリック数", "クリック", "clicks"),
    "cost": ("費用", "コスト", "cost"),
    "conversions": ("コンバージョン", "コンバージョン数", "conversions", "conv."),
    "conversion_value": (
        "コンバージョンの価値", "コンバージョン値", "conv. value", "conversion value", "all conv. value",
    ),
}

_MISSING = {"", "--", "—", "-", "‐", "n/a", "na", "null"}


class ImportResult:
    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []
        self.skipped: int = 0
        self.errors: List[str] = []
        self.detected_format: Optional[str] = None

    def as_response(self) -> Dict[str, Any]:
        return {
            "imported": len(self.rows),
            "skipped": self.skipped,
            "errors": self.errors[:20],
            "detected_format": self.detected_format,
        }


def decode_bytes(raw: bytes) -> str:
    """文字コードを推定してデコードする。全滅したら置換文字で強行。"""
    for enc in _ENCODINGS:
        try:
            text = raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
        # UTF-16をUTF-8として読むとNUL混じりになるので弾く
        if "\x00" in text:
            continue
        return text
    return raw.decode("utf-8", errors="replace")


def parse_number(value: Any) -> float:
    """「¥1,234.56」「1 234」「--」などを数値へ。解釈できなければ0。"""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if text.lower() in _MISSING:
        return 0.0
    text = re.sub(r"[^\d.\-]", "", text.replace(",", ""))
    if text in ("", "-", ".", "-."):
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _normalize_header(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "")).strip().lower()


def _build_index(headers: Sequence[str]) -> Dict[str, int]:
    """論理名 → 列インデックス。前方一致も許して表記ゆれを吸収する。"""
    normalized = [_normalize_header(h) for h in headers]
    index: Dict[str, int] = {}
    for logical, aliases in _ALIASES.items():
        for alias in aliases:
            alias_n = _normalize_header(alias)
            for i, h in enumerate(normalized):
                if h == alias_n or h.startswith(alias_n):
                    index[logical] = i
                    break
            if logical in index:
                break
    return index


def _looks_like_total_row(cells: Sequence[str]) -> bool:
    first = _normalize_header(cells[0] if cells else "")
    return first.startswith("合計") or first.startswith("total") or first.startswith("--")


def read_google_ads_csv(
    text: str, required: Sequence[str]
) -> Tuple[List[Dict[str, Any]], Dict[str, int], List[str]]:
    """プリアンブルを飛ばしてヘッダ行を見つけ、正規化済みの行を返す。"""
    errors: List[str] = []
    sample = text[:4096]
    delimiter = "\t" if sample.count("\t") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = [row for row in reader]

    header_index: Optional[int] = None
    index: Dict[str, int] = {}
    for i, row in enumerate(all_rows[:15]):  # プリアンブルは通常数行
        candidate = _build_index(row)
        if all(key in candidate for key in required):
            header_index = i
            index = candidate
            break

    if header_index is None:
        errors.append(
            "ヘッダ行を特定できませんでした。必要な列: " + " / ".join(required)
        )
        return [], {}, errors

    rows: List[Dict[str, Any]] = []
    for row in all_rows[header_index + 1 :]:
        if not row or all(not c.strip() for c in row):
            continue
        if _looks_like_total_row(row):
            continue
        rows.append({key: (row[i] if i < len(row) else "") for key, i in index.items()})
    return rows, index, errors


def import_keyword_report(raw: bytes, offer_id: str, default_date: str) -> ImportResult:
    """キーワード レポート → ad_stats_daily 用の行。"""
    result = ImportResult()
    result.detected_format = "google_ads_keyword_report"
    text = decode_bytes(raw)
    rows, _, errors = read_google_ads_csv(text, required=("keyword", "clicks"))
    result.errors.extend(errors)

    for row in rows:
        keyword = (row.get("keyword") or "").strip()
        if not keyword or keyword.lower() in _MISSING:
            result.skipped += 1
            continue
        campaign = (row.get("campaign") or "").strip()
        ad_group = (row.get("ad_group") or "").strip()
        result.rows.append(
            {
                "date": (row.get("date") or "").strip() or default_date,
                "offer_id": offer_id,
                "campaign_id": campaign,
                "ad_group_id": ad_group,
                "criterion_id": f"{campaign}|{ad_group}|{keyword}",
                "keyword_text": keyword,
                "match_type": (row.get("match_type") or "").strip() or None,
                "impressions": int(parse_number(row.get("impressions"))),
                "clicks": int(parse_number(row.get("clicks"))),
                "cost": parse_number(row.get("cost")),
                "conversions": parse_number(row.get("conversions")),
                "conversion_value": parse_number(row.get("conversion_value")),
            }
        )
    return result


def import_search_term_report(raw: bytes, offer_id: str, default_date: str) -> ImportResult:
    """検索語句レポート → search_terms_daily 用の行。"""
    result = ImportResult()
    result.detected_format = "google_ads_search_term_report"
    text = decode_bytes(raw)
    rows, _, errors = read_google_ads_csv(text, required=("search_term", "clicks"))
    result.errors.extend(errors)

    for row in rows:
        term = (row.get("search_term") or "").strip()
        if not term or term.lower() in _MISSING:
            result.skipped += 1
            continue
        result.rows.append(
            {
                "date": (row.get("date") or "").strip() or default_date,
                "offer_id": offer_id,
                "campaign_id": (row.get("campaign") or "").strip(),
                "ad_group_id": (row.get("ad_group") or "").strip(),
                "search_term": term,
                "impressions": int(parse_number(row.get("impressions"))),
                "clicks": int(parse_number(row.get("clicks"))),
                "cost": parse_number(row.get("cost")),
                "conversions": parse_number(row.get("conversions")),
                "conversion_value": parse_number(row.get("conversion_value")),
            }
        )
    return result


# ASPの承認結果CSVは各社バラバラなので、列名の候補を広めに取る
_APPROVAL_ALIASES: Dict[str, Sequence[str]] = {
    "conversion_date": ("発生日", "成果発生日", "日付", "date", "conversion date"),
    "count": ("発生件数", "件数", "成果件数", "count", "conversions"),
    "approved_count": ("承認件数", "確定件数", "approved", "approved count"),
    "rejected_count": ("否認件数", "却下件数", "rejected", "rejected count"),
    "approved_revenue": ("確定報酬", "承認報酬", "報酬額", "approved revenue", "revenue"),
}


def import_approval_csv(raw: bytes, offer_id: str) -> ImportResult:
    """ASPの承認結果CSV → approvals 用の行（SPEC Sprint 8）。"""
    result = ImportResult()
    result.detected_format = "asp_approval_csv"
    text = decode_bytes(raw)

    reader = csv.reader(io.StringIO(text))
    all_rows = list(reader)
    header_index: Optional[int] = None
    index: Dict[str, int] = {}
    for i, row in enumerate(all_rows[:15]):
        normalized = [_normalize_header(c) for c in row]
        candidate: Dict[str, int] = {}
        for logical, aliases in _APPROVAL_ALIASES.items():
            for alias in aliases:
                alias_n = _normalize_header(alias)
                for j, h in enumerate(normalized):
                    if h == alias_n or h.startswith(alias_n):
                        candidate[logical] = j
                        break
                if logical in candidate:
                    break
        if "conversion_date" in candidate and "approved_count" in candidate:
            header_index, index = i, candidate
            break

    if header_index is None:
        result.errors.append(
            "ヘッダ行を特定できませんでした。「発生日」と「承認件数」に相当する列が必要です。"
        )
        return result

    for row in all_rows[header_index + 1 :]:
        if not row or all(not c.strip() for c in row):
            continue
        if _looks_like_total_row(row):
            continue

        def cell(key: str) -> str:
            i = index.get(key)
            return row[i] if i is not None and i < len(row) else ""

        date = cell("conversion_date").strip()
        if not date:
            result.skipped += 1
            continue
        approved = parse_number(cell("approved_count"))
        rejected = parse_number(cell("rejected_count"))
        total = parse_number(cell("count")) or (approved + rejected)
        result.rows.append(
            {
                "offer_id": offer_id,
                "conversion_date": date,
                "count": total,
                "approved_count": approved,
                "rejected_count": rejected,
                "approved_revenue": parse_number(cell("approved_revenue")),
                "source": "csv",
            }
        )
    return result
