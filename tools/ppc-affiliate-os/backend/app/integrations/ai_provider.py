"""AIプロバイダの抽象化（SPEC 5.4）。

意思決定エンジンはこのモジュールに一切依存しない。AIが落ちても
採算計算・撤退判定は動く（SPEC 20章 受入基準9）。AIが担うのは
「意図・商用度・想定LP CTR・クラスタ名」という入力の供給だけ。

JSON Schema はプロバイダ間で共有し、出力形式を強制する（受入基準10）。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Protocol

__all__ = [
    "AIProvider",
    "AIProviderError",
    "CLASSIFICATION_SCHEMA",
    "SEED_SCHEMA",
    "CLASSIFY_SYSTEM_PROMPT",
    "SEED_SYSTEM_PROMPT",
    "build_classify_prompt",
    "build_seed_prompt",
    "parse_json_payload",
    "chunked",
]


class AIProviderError(RuntimeError):
    """AI呼び出しの失敗。呼び出し側は503にして数式側の機能は生かす。"""


class AIProvider(Protocol):
    name: str
    model: str

    def classify_keywords(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]: ...

    def generate_seeds(self, payload: Dict[str, Any]) -> List[Dict[str, str]]: ...


# --------------------------------------------------------------- スキーマ

CLASSIFICATION_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string"},
                    "intent": {
                        "type": "string",
                        "enum": [
                            "購入申込直前", "査定見積", "比較", "相場価格",
                            "情報収集", "問題解決", "ずらし", "ノイズ",
                        ],
                    },
                    "conversion_distance": {"type": "integer"},
                    "commercial_intent": {"type": "integer"},
                    "noise_risk": {"type": "integer"},
                    "cluster": {"type": "string"},
                    "estimated_lp_click_rate": {"type": "number"},
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": [
                    "keyword", "intent", "conversion_distance", "commercial_intent",
                    "noise_risk", "cluster", "estimated_lp_click_rate", "confidence", "reason",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

SEED_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "seeds": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "商品サービス名", "売却申込行動", "比較", "査定", "相場",
                            "問題悩み", "状況", "競合", "地域", "ずらし", "周辺需要",
                        ],
                    },
                    "rationale": {"type": "string"},
                },
                "required": ["keyword", "category", "rationale"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["seeds"],
    "additionalProperties": False,
}


# --------------------------------------------------------------- プロンプト
# 案件ごとに変わらない部分を先頭に置き、プロンプトキャッシュが効くようにしている。

CLASSIFY_SYSTEM_PROMPT = """あなたは日本語のPPCアフィリエイト運用者を補助する分類器です。

役割は「検索意図の評価」だけです。採算判定・出稿可否・バケット分類（CORE/OPPORTUNITY等）は
呼び出し側のコードが数式で決めます。あなたはその入力を作ります。

各キーワードについて次を出力します。
- intent: 検索意図ラベル
- conversion_distance: 0-100。成約行動にどれだけ近いか（高いほど近い）
- commercial_intent: 0-100。金銭が動く意図の強さ
- noise_risk: 0-100。無関係な流入・冷やかしを集めるリスク
- cluster: 意味が近いKWをまとめる短い日本語名（同じ意味なら必ず同じ文字列にする）
- estimated_lp_click_rate: このKWで着地したユーザーがLPのアフィリエイトCTAを押す確率の仮説（0-1）
- confidence: 上記推定の確信度（0-1）。根拠が薄いときは正直に低くする
- reason: 一文の根拠

厳守事項:
- 検索ボリュームやCPCを推測して書かない。数値データは呼び出し側が持っている。
- estimated_lp_click_rate は事実ではなく仮説。楽観に寄せず、確信度で不確かさを表す。
- 与えられた広告ルール（商標可否・競合KW可否・NG表現）に反するKWは
  noise_risk を高くし、reason に理由を書く。
- 入力されたキーワードを1件も省略せず、同じ文字列のまま返す。"""

SEED_SYSTEM_PROMPT = """あなたは日本語のPPCアフィリエイト運用者のためのシードキーワード生成器です。

Google Ads の KeywordPlanIdeaService に投入する種を作ります。拡張はGoogle側が行うので、
あなたは「意味の広がりの起点」を網羅的に出します。

カテゴリを横断して出すこと:
商品サービス名 / 売却申込行動 / 比較 / 査定 / 相場 / 問題悩み / 状況 / 競合 / 地域 / ずらし / 周辺需要

厳守事項:
- 与えられた広告ルールに反するKW（商標NG・競合NG等）は出さない。
- 検索ボリュームを推測して書かない。
- 実際に日本語話者が検索窓に入力する語形で書く。単語の羅列や英語直訳を避ける。
- 「ずらし」「周辺需要」は必ず数件含める。直接語だけでは市場が枯れるため。"""


def build_classify_prompt(payload: Dict[str, Any]) -> str:
    rules = payload.get("rules") or []
    lines = [
        f"案件名: {payload.get('offer_name', '')}",
        f"成果地点: {payload.get('conversion_point', '')}",
        f"成果単価: {payload.get('payout', 0)}円",
        "広告ルール: " + ("／".join(rules) if rules else "特になし"),
        "",
        "分類対象キーワード:",
    ]
    lines.extend(f"- {kw}" for kw in payload.get("keywords", []))
    return "\n".join(lines)


def build_seed_prompt(payload: Dict[str, Any]) -> str:
    rules = payload.get("rules") or []
    lines = [
        f"案件名: {payload.get('offer_name', '')}",
        f"案件概要: {payload.get('description', '')}",
        f"成果地点: {payload.get('conversion_point', '')}",
        f"ターゲット: {payload.get('target_audience', '')}",
        f"LP URL: {payload.get('landing_page_url') or '未指定'}",
        "広告ルール: " + ("／".join(rules) if rules else "特になし"),
        "",
        f"シードキーワードを最大{payload.get('max_seeds', 40)}件出してください。",
    ]
    return "\n".join(lines)


def parse_json_payload(text: str) -> Dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"AIの出力をJSONとして解釈できませんでした: {exc}") from exc
    if not isinstance(data, dict):
        raise AIProviderError("AIの出力がオブジェクトではありません")
    return data


def chunked(items: List[Any], size: int) -> List[List[Any]]:
    return [items[i : i + size] for i in range(0, len(items), size)]
