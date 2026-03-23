#!/usr/bin/env python3
"""
gen_cover_837a.py
subtask_837a: note記事カバー画像生成
「1万再生なのに登録者23人だった話」カバー画像

出力: /home/murakami/multi-agent-shogun/projects/note_mcp_server/work/cover_837a.png
サイズ: 1280x670px
"""

import os, sys, io
from pathlib import Path
from google import genai
from google.genai import types

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY not set. Run: source ~/.bashrc")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL_ID = "gemini-3.1-flash-image-preview"

OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/work/cover_837a.png")

PROMPT = """
Create a YouTube channel analytics screenshot style cover image for a blog post.
The concept: dramatic contrast between 10,000 video views and only 23 subscribers.

Design:
- Dark background (YouTube-style dark theme, very dark gray #1a1a1a or #0f0f0f)
- Large YouTube-style play button icon (red) in the center-left area
- Giant number "10,000" in bright white, large bold font — labeled "再生回数" (views)
- Next to or below it, tiny number "23" in gray or muted color — labeled "チャンネル登録者" (subscribers)
- Japanese text: "1万再生なのに登録者23人" in bold Japanese font, white or yellow
- Sub text: "チャンネル開設2ヶ月の話" in smaller white text
- The size contrast between 10,000 and 23 should be visually dramatic
- Clean, modern infographic style
- Aspect ratio: approximately 1280x670 (landscape, wide format)
- The overall mood is ironic/funny — huge views, tiny subscriber count

Text to include:
- "1万再生なのに" (big)
- "登録者23人" (also big, with emphasis on the small number)
- Some YouTube analytics UI elements as decoration
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
