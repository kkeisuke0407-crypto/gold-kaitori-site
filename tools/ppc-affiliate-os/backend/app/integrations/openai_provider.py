"""OpenAI プロバイダ（オプション）。

MVPからの修正点:
- ユーザーメッセージに `str(dict)` を渡していたのを、明示的なプロンプト整形に変更。
- バケット判定をAIに出させていたのをやめ、意図評価だけに絞った
  （バケットは keyword_scoring.py が数式で決める）。
- 例外を握りつぶさず AIProviderError に正規化。
"""
from __future__ import annotations

from typing import Any, Dict, List

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

BATCH_SIZE = 60


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4.1"):
        if not api_key:
            raise AIProviderError("OPENAI_API_KEY が設定されていません")
        self.api_key = api_key
        self.model = model
        self._client = None

    @classmethod
    def from_settings(cls, settings) -> "OpenAIProvider":
        return cls(api_key=settings.openai_api_key, model=settings.openai_model)

    def _get_client(self):
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError as exc:  # pragma: no cover - 環境依存
                raise AIProviderError(
                    "openai パッケージが未インストールです（pip install openai）"
                ) from exc
            self._client = OpenAI(api_key=self.api_key)
        return self._client

    def _call(self, system_prompt: str, user_prompt: str, schema: Dict[str, Any], name: str) -> Dict[str, Any]:
        client = self._get_client()
        try:
            response = client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": name,
                        "schema": schema,
                        "strict": True,
                    }
                },
            )
        except Exception as exc:  # SDKの例外階層に依存しない
            raise AIProviderError(f"OpenAI APIエラー: {exc}") from exc

        text = getattr(response, "output_text", "") or ""
        if not text.strip():
            raise AIProviderError("OpenAIから空の応答が返りました")
        return parse_json_payload(text)

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
                "keyword_classification",
            )
            items = data.get("items")
            if not isinstance(items, list):
                raise AIProviderError("分類結果に items 配列がありません")
            results.extend(items)
        return results

    def generate_seeds(self, payload: Dict[str, Any]) -> List[Dict[str, str]]:
        data = self._call(
            SEED_SYSTEM_PROMPT, build_seed_prompt(payload), SEED_SCHEMA, "seed_keywords"
        )
        seeds = data.get("seeds")
        if not isinstance(seeds, list):
            raise AIProviderError("シード生成結果に seeds 配列がありません")
        return seeds


def get_provider(settings):
    """設定に応じたプロバイダを返す。両方未設定なら AIProviderError。"""
    from app.integrations.anthropic_provider import AnthropicProvider

    preferred = (settings.ai_provider or "anthropic").lower()
    if preferred == "openai" and settings.openai_api_key:
        return OpenAIProvider.from_settings(settings)
    if settings.anthropic_api_key:
        return AnthropicProvider.from_settings(settings)
    if settings.openai_api_key:
        return OpenAIProvider.from_settings(settings)
    raise AIProviderError(
        "AIプロバイダが未設定です。ANTHROPIC_API_KEY または OPENAI_API_KEY を設定してください。"
    )
