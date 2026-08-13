"""Claude (Anthropic Messages API) プロバイダ。

MVPでは NotImplementedError のスタブだったが、SPEC 5.4 のセカンドオピニオン用途を
含めて実装した。既定プロバイダはこちら（AI_PROVIDER=anthropic）。

実装メモ:
- Structured Outputs (`output_config.format`) でJSON Schema準拠を強制する。
- システムプロンプトは案件間で共通なので `cache_control` を付けてキャッシュを効かせる。
- `stop_reason == "refusal"` を content 参照前に必ずチェックする。
- 数式はコード側にあるため、AIが落ちても判定は動く（SPEC 受入基準9）。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.integrations.ai_provider import (
    CLASSIFICATION_SCHEMA,
    CLASSIFY_SYSTEM_PROMPT,
    SEED_SCHEMA,
    SEED_SYSTEM_PROMPT,
    AIProviderError,
    build_classify_prompt,
    build_seed_prompt,
    chunked,
    parse_json_payload,
)

# 1回のリクエストで扱うKW数。多すぎると出力が max_tokens に当たる。
BATCH_SIZE = 60
MAX_TOKENS = 16000


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str = "claude-opus-5"):
        if not api_key:
            raise AIProviderError("ANTHROPIC_API_KEY が設定されていません")
        self.api_key = api_key
        self.model = model
        self._client = None

    @classmethod
    def from_settings(cls, settings) -> "AnthropicProvider":
        return cls(api_key=settings.anthropic_api_key, model=settings.anthropic_model)

    def _get_client(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError as exc:  # pragma: no cover - 環境依存
                raise AIProviderError(
                    "anthropic パッケージが未インストールです（pip install anthropic）"
                ) from exc
            self._client = anthropic.Anthropic(api_key=self.api_key)
        return self._client

    # ------------------------------------------------------------------

    def _call(self, system_prompt: str, user_prompt: str, schema: Dict[str, Any]) -> Dict[str, Any]:
        client = self._get_client()
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise AIProviderError("anthropic パッケージが未インストールです") from exc

        try:
            response = client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                thinking={"type": "adaptive"},
                system=[
                    {
                        "type": "text",
                        "text": system_prompt,
                        # 案件をまたいで固定の前置きなのでキャッシュ対象にする
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                output_config={"format": {"type": "json_schema", "schema": schema}},
                messages=[{"role": "user", "content": user_prompt}],
            )
        except anthropic.RateLimitError as exc:
            raise AIProviderError("Claude APIのレート制限に達しました。時間をおいて再実行してください。") from exc
        except anthropic.APIStatusError as exc:
            raise AIProviderError(f"Claude APIエラー ({exc.status_code}): {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise AIProviderError("Claude APIに接続できませんでした") from exc

        # content を読む前に必ず stop_reason を見る
        if response.stop_reason == "refusal":
            detail = getattr(response, "stop_details", None)
            category = getattr(detail, "category", None) if detail else None
            raise AIProviderError(f"Claudeが応答を拒否しました（category={category}）")
        if response.stop_reason == "max_tokens":
            raise AIProviderError(
                "出力がトークン上限に達しました。キーワード件数を減らして再実行してください。"
            )

        text = "".join(
            block.text for block in response.content if getattr(block, "type", "") == "text"
        )
        if not text.strip():
            raise AIProviderError("Claudeから空の応答が返りました")
        return parse_json_payload(text)

    # ------------------------------------------------------------------

    def classify_keywords(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        keywords = list(payload.get("keywords") or [])
        if not keywords:
            return []
        results: List[Dict[str, Any]] = []
        for batch in chunked(keywords, BATCH_SIZE):
            data = self._call(
                CLASSIFY_SYSTEM_PROMPT,
                build_classify_prompt({**payload, "keywords": batch}),
                CLASSIFICATION_SCHEMA,
            )
            items = data.get("items")
            if not isinstance(items, list):
                raise AIProviderError("分類結果に items 配列がありません")
            results.extend(items)
        return results

    def generate_seeds(self, payload: Dict[str, Any]) -> List[Dict[str, str]]:
        data = self._call(SEED_SYSTEM_PROMPT, build_seed_prompt(payload), SEED_SCHEMA)
        seeds = data.get("seeds")
        if not isinstance(seeds, list):
            raise AIProviderError("シード生成結果に seeds 配列がありません")
        return seeds

    def review(self, snapshot: Dict[str, Any]) -> str:
        """撤退/継続判断のセカンドオピニオン（SPEC 5.4）。

        戻り値は文章。**この文章だけで自動停止はしない**（SPEC 22.2）。
        あくまで数値ルールの結果に人が目を通すための補助。
        """
        import json

        client = self._get_client()
        response = client.messages.create(
            model=self.model,
            max_tokens=4000,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": (
                        "あなたはPPCアフィリエイトの運用レビュアーです。"
                        "与えられた実績スナップショットと、ツールが数式で出した判定を読み、"
                        "見落としているリスクと、判定に反対するならその根拠を日本語で述べてください。"
                        "数値を作らず、与えられた数値だけで論じること。"
                    ),
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(snapshot, ensure_ascii=False, indent=2, default=str),
                }
            ],
        )
        if response.stop_reason == "refusal":
            raise AIProviderError("Claudeが応答を拒否しました")
        return "".join(
            b.text for b in response.content if getattr(b, "type", "") == "text"
        )
