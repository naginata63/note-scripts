#!/usr/bin/env python3
"""
gen_cover_862.py
subtask_862_note: note記事カバー画像生成
「動画を分割したら4.5秒ズレた（と思った）話」

出力: /home/murakami/multi-agent-shogun/projects/note_mcp_server/work/cover_862.png
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

OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/work/cover_862.png")

PROMPT = """
Create a tech blog cover image for a post about a 4.5-second timing drift bug in video processing.

Design concept:
- Dark terminal / code editor background (very dark #1a1a1a or #0f0f0f)
- Center: A large ffmpeg terminal window showing video cut commands
- Bold Japanese text overlay: "動画を分割したら" in white, large font
- Below it: "4.5秒ズレた" in bright red/orange, even larger and more dramatic
- Smaller text: "（と思った）話" in gray
- A confused/shocked emoji face or icon (😱) somewhere prominent
- Some visual elements suggesting time drift: clock icon, timer, waveform mismatch
- Code snippet visible: ffmpeg -i input.mp4 -c copy -f segment ...
- Color scheme: dark background, white/red/orange text, terminal green for code
- Modern tech blog style, clean and readable
- Aspect ratio: approximately 1280x670 (wide landscape format)
- The overall mood: technical frustration that turned out to be self-inflicted

Key text to include:
- "動画を分割したら" (big)
- "4.5秒ズレた" (biggest, red/orange)
- "（と思った）話" (medium, gray)
- Optional: small text "#ffmpeg #動画編集"
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
