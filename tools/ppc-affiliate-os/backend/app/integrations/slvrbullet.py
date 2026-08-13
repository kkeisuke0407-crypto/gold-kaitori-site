"""SLVRbullet との責務境界（SPEC 5.2）。

このツールは SLVRbullet の API を呼ばない。役割分担は以下で固定する。

  SLVRbullet : 発生成果 → Google Ads のコンバージョンアクションへアップロード
  このツール : Google Ads から発生成果を読む / LP→アフィクリックを自前計測 /
               承認率・確定売上を別管理 / 意思決定

「発生CV（Google最適化用）」と「承認済み利益（経営判断用）」を混同しないこと（SPEC 22.4）。
"""
from __future__ import annotations

from typing import Dict, List

# LP下部に設置する、SLVRbullet指定のパラメータ引き継ぎタグ
SLVRBULLET_PARAMETER_TAG = '<script src="https://js.slvrbullet.com/pt.min.js"></script>'

# 引き継ぎ対象のクリックID
CLICK_ID_PARAMS = ("gclid", "wbraid", "gbraid")


def lp_setup_checklist(tracker_endpoint: str, offer_id: str) -> List[Dict[str, str]]:
    """LP側に入れるものの一覧。管理画面のセットアップ手順に出す。"""
    return [
        {
            "step": "1",
            "title": "SLVRbullet パラメータ引き継ぎタグ",
            "detail": "LPの</body>直前に設置。gclid/wbraid/gbraid をアフィリンクへ引き継ぐ。",
            "code": SLVRBULLET_PARAMETER_TAG,
        },
        {
            "step": "2",
            "title": "自前クリック計測タグ",
            "detail": "LP→アフィクリックを自分で数えるためのタグ。SLVRbulletとは別に必要。",
            "code": (
                "<script>\n"
                "  window.PPC_OS_CONFIG = {\n"
                f"    endpoint: '{tracker_endpoint}',\n"
                f"    offerId: '{offer_id}'\n"
                "  };\n"
                "</script>\n"
                '<script src="/tools/ppc/tracker.js" defer></script>'
            ),
        },
        {
            "step": "3",
            "title": "CTAへの目印",
            "detail": "計測したいアフィリエイトリンクに data-ppc-affiliate-cta を付ける。値は設置位置名。",
            "code": '<a href="..." data-ppc-affiliate-cta="fv_hero">無料査定へ</a>',
        },
        {
            "step": "4",
            "title": "Google Ads 最終ページURLサフィックス",
            "detail": "アカウント設定に1回入れる。全クリックにKW・マッチタイプ等が付与される。",
            "code": (
                "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}"
                "&utm_term={keyword}&mt={matchtype}&dev={device}&agp={adgroupid}"
            ),
        },
    ]
