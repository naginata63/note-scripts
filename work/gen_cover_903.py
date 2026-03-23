#!/usr/bin/env python3
"""
gen_cover_903.py
subtask_903a: note記事カバー画像生成（C8 + 過去記事3件以上）
Gemini画像生成API使用

生成対象:
  1. qc_telephone_game_cover.png   (C8記事)
  2. ai_auto_post_cover.png
  3. rule_based_trap_cover.png
  4. ai_short_selection_fail_cover.png
"""

import os, sys, time
from pathlib import Path
from google import genai
from google.genai import types

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY not set. Run: source ~/.bashrc")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL_ID = "gemini-3.1-flash-image-preview"

ARTICLES_DIR = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles")

COVERS = [
    {
        "output": ARTICLES_DIR / "qc_telephone_game_cover.png",
        "prompt": """
Create a clean, modern cover image for a Japanese tech blog post about AI quality control breaking down through a telephone game effect.

Design:
- Dark background (#0f0f0f or very dark charcoal)
- Main visual: A chain of 4 figures/nodes connected by arrows, each slightly faded/degraded from left to right
  - Left node: bright red "🚨" or exclamation mark (the urgent complaint)
  - Right node: pale, washed-out checkmark (the diluted QC)
- Temperature or signal meter going from HOT (left, red/orange) to COLD (right, light blue/grey)
- Japanese text: "「これダメ」の温度感が" in medium white text at top
- Japanese text: "3次伝達で消える" in large bold white/yellow text center
- Small subtitle text: "AIエージェントの伝言ゲーム問題" in smaller grey text
- Accent: degradation/fade visual effect — the rightmost node should look pale and lifeless
- Clean, minimalist infographic style
- Aspect ratio: 1280x670 (landscape)
- Mood: serious, technical, slightly alarming
- Minimal text, let the visual metaphor carry it
"""
    },
    {
        "output": ARTICLES_DIR / "ai_auto_post_cover.png",
        "prompt": """
Create a clean, modern cover image for a Japanese tech blog post about an AI tool that automatically posts articles to a blogging platform.

Design:
- Dark background (#0f0f0f or very dark navy)
- Main visual: A simple automation pipeline icon — Markdown document → gear/robot icon → blog post icon, connected by arrows
- A robot or AI icon in the center, looking productive/efficient
- Japanese text: "この記事" in smaller text, with a robot icon
- Japanese text: "AIが書いて" in medium bold white text
- Japanese text: "AIが投稿しました" in large bold text, white or bright cyan
- Small text: "note自動投稿ツール" in grey
- Accent color: bright cyan or electric blue (#00E5FF or similar) for the automation arrows
- Clean, tech-forward minimal design
- Aspect ratio: 1280x670 (landscape)
- Mood: efficient, slightly playful, modern
"""
    },
    {
        "output": ARTICLES_DIR / "rule_based_trap_cover.png",
        "prompt": """
Create a clean, modern cover image for a Japanese tech blog post about a bug where a rule-based if-statement caused only 2 out of 4 game streamers to appear in auto-generated thumbnails.

Design:
- Dark background (#1a1a1a or very dark)
- Main visual: 4 character silhouettes/avatars in a row
  - 2 are bright and visible (highlighted)
  - 2 are grayed out or crossed out (filtered away by the if statement)
- A code snippet visual: `if counter >= 2:` in monospace font, styled like a code editor with syntax highlighting (orange/yellow keyword, white text)
- Japanese text: "4人いるのに" in medium text
- Japanese text: "2人しか出ない" in large bold text, white or red-orange
- Small text: "ルールベースの落とし穴" in grey
- Visual metaphor: an "if" gate filtering out people
- Tech/developer aesthetic, code editor color scheme
- Aspect ratio: 1280x670 (landscape)
- Mood: ironic, "aha moment", slightly humorous
"""
    },
    {
        "output": ARTICLES_DIR / "ai_short_selection_fail_cover.png",
        "prompt": """
Create a clean, modern cover image for a Japanese tech blog post about AI-selected YouTube Shorts candidates — where 4 out of 5 "confidence score 1.0" picks turned out to be boring.

Design:
- Dark background (#0f0f0f or very dark)
- Main visual: 5 video thumbnail slots/cards
  - 1 has a bright green checkmark (the one good pick)
  - 4 have a dull red X or grey thumbs down (boring picks)
- A "AI SCORE: 1.0" badge or label, slightly ironic — shown next to one of the X-marked cards
- Japanese text: "信頼度スコア1.0でも" in medium white text at top
- Japanese text: "4本はつまらなかった" in large bold text, white or warm yellow
- Small text: "AIショート選定の失敗事例" in grey
- Accent: the contrast between the AI's confidence (1.0 score) and the X marks
- Clean, data-visualization style
- Aspect ratio: 1280x670 (landscape)
- Mood: honest, slightly self-deprecating, informative
"""
    },
]


def generate_cover(item: dict) -> bool:
    output_path = item["output"]
    prompt = item["prompt"]

    if output_path.exists():
        print(f"スキップ（既存）: {output_path.name}")
        return True

    print(f"\n生成開始: {output_path.name}")
    print(f"model: {MODEL_ID}")

    try:
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            )
        )

        image_saved = False
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                img_bytes = part.inline_data.data
                output_path.write_bytes(img_bytes)
                print(f"保存完了: {output_path} ({len(img_bytes):,} bytes)")
                image_saved = True
                break
            elif hasattr(part, 'text') and part.text:
                print(f"テキスト応答: {part.text[:200]}")

        if not image_saved:
            print(f"ERROR: 画像パートが見つかりません ({output_path.name})")
            print("Response parts:", [type(p).__name__ for p in response.candidates[0].content.parts])
            return False

        return True

    except Exception as e:
        print(f"ERROR ({output_path.name}): {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print(f"カバー画像生成開始: {len(COVERS)}件")
    results = []
    for i, item in enumerate(COVERS):
        ok = generate_cover(item)
        results.append((item["output"].name, ok))
        if i < len(COVERS) - 1:
            time.sleep(2)  # API rate limit対策

    print("\n=== 結果 ===")
    for name, ok in results:
        status = "✅" if ok else "❌"
        print(f"  {status} {name}")

    failed = [name for name, ok in results if not ok]
    if failed:
        print(f"\nFAILED: {failed}")
        sys.exit(1)
    else:
        print("\n全件完了")


if __name__ == "__main__":
    main()
