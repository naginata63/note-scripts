#!/usr/bin/env python3
"""
gen_cover_873.py
subtask_873_note: note記事カバー画像生成
「6日で登録者8→117人達成の全データ公開」カバー画像

出力: /home/murakami/multi-agent-shogun/projects/note_mcp_server/work/cover_873.png
サイズ: 1280x670px
"""

import os, sys
from pathlib import Path
from google import genai
from google.genai import types

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY not set. Run: source ~/.bashrc")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL_ID = "gemini-3.1-flash-image-preview"

OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/work/cover_873.png")

PROMPT = """
Create a clean, modern infographic-style cover image for a blog post about a YouTube channel growing from 8 to 117 subscribers in 6 days using AI automation.

Design:
- Dark background (#0f0f0f or very dark navy)
- A simple upward-trending growth chart/graph as the main visual element — dramatic curve going from bottom-left (very low) to top-right (high)
- Giant bold numbers: "8" on the left (small, faded) → "117" on the right (large, bright white or bright yellow-green)
- Arrow or line connecting the two numbers showing growth
- Japanese text prominently: "6日で" (in smaller text above the numbers)
- Japanese text: "登録者 8 → 117人" (large, bold, center)
- Sub-text: "AIが全部やった話" in smaller white text
- Accent color: YouTube red (#FF0000) for the chart line or arrow
- The number contrast (tiny "8" vs huge "117") should feel dramatic
- Clean sans-serif Japanese-compatible typography
- Aspect ratio: 1280x670 (landscape)
- Overall mood: impressive, data-driven, slightly surprising

Text to include:
- "6日で" (smaller)
- "登録者 8 → 117人" (large/bold)
- "AIが全部やった話" (medium)
"""

print(f"Gemini画像生成開始... model={MODEL_ID}")

try:
    response = client.models.generate_content(
        model=MODEL_ID,
        contents=PROMPT,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        )
    )

    image_saved = False
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            img_bytes = part.inline_data.data
            OUTPUT_PATH.write_bytes(img_bytes)
            print(f"画像保存完了: {OUTPUT_PATH}")
            print(f"サイズ: {len(img_bytes)} bytes")
            image_saved = True
            break
        elif hasattr(part, 'text') and part.text:
            print(f"テキスト応答: {part.text[:200]}")

    if not image_saved:
        print("ERROR: 画像パートが見つかりません")
        print("Response:", response)
        sys.exit(1)

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("完了")
