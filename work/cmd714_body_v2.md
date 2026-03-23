「このシーンに笑顔を使うか、驚き顔を使うか」という判断を自動化したくて、気づいたらEmbeddingにたどり着いていた。

ゲーム実況の切り抜き動画を自動生成するパイプラインを作っていた。8ステップの処理のうち、問題が起きたのはすべてif文で書いた箇所だった（この話は[前回記事](https://note.com/n/ncf467d89cc29)に書いた）。

その反省から「if文で判断するな、AIに任せよ」と方針転換したわけだが、表情選定でEmbeddingが想像以上に使えることを発見した。しかも全部無料枠で動いた。

## Gemini Embedding 2とは

GoogleのEmbedding API。テキストも画像も同じベクトル空間に埋め込める**マルチモーダル**対応。3072次元のベクトルを返す（Matryoshka圧縮で768次元に縮小も可）。

`google-genai`パッケージで数行で動く：

```
from google import genai
from google.genai import types as genai_types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
result = client.models.embed_content(
    model="models/gemini-embedding-2-preview",
    contents="このシーンに笑顔を使うか驚き顔を使うか",
    config=genai_types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY")
)
embedding = list(result.embeddings[0].values)
```

現時点ではプレビュー版だが、無料枠で本番投入できるレベルで動いている。

## 実使用例① テキスト→表情マッチング

切り抜き動画のサムネには5キャラ×9表情（smile/surprise/angry/scheming…）= 45パターンの差分立ち絵がある。字幕テキストからどの表情を選ぶかをEmbeddingで自動化した。

仕組みはシンプル。各表情に日本語ラベルを定義（例：smile=「嬉しさで自然に口角が上がる笑顔」、surprise=「驚きで目を見開く表情」）。ラベルをEmbeddingしてキャッシュしておき、シーンの字幕テキストをEmbeddingしてコサイン類似度が最も高い表情を選択する。

コア実装：

```
def cosine_similarity(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    return dot / (norm_a * norm_b)

def embed_text(client, text: str) -> list:
    result = client.models.embed_content(
        model="models/gemini-embedding-2-preview",
        contents=text,
        config=genai_types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY")
    )
    return list(result.embeddings[0].values)

def match_expression(query_emb: list, expr_embeddings: dict) -> tuple:
    best_expr, best_score = None, -1.0
    for expr, emb in expr_embeddings.items():
        score = cosine_similarity(query_emb, emb)
        if score > best_score:
            best_score = score
            best_expr = expr
    return best_expr, best_score
```

実際の判定結果：8シーン中5つがsurprise、3つがangry。ゲーム実況は「驚き」「ツッコミ」が多いので自然な偏りだ。if文で`if "びっくり" in text`と書いていた頃と違い、文脈を読んで判断している。

## 実使用例② 画像Embedding（クロスモーダル）

テキストだけでなく、立ち絵画像そのものをEmbeddingして照合もできる。

```
def embed_image(client, image_path: str) -> list:
    with open(image_path, "rb") as f:
        uploaded = client.files.upload(file=f, config={"mime_type": "image/png"})
    result = client.models.embed_content(
        model="models/gemini-embedding-2-preview",
        contents=genai_types.Content(parts=[
            genai_types.Part(file_data=genai_types.FileData(
                file_uri=uploaded.uri, mime_type="image/png"
            ))
        ])
    )
    return list(result.embeddings[0].values)
```

テキストと画像が同じベクトル空間に存在するため、「驚いてる字幕」→ 画像のEmbeddingと類似度計算でクロスモーダル検索ができる。画像を1回Embeddingしておけばキャッシュで再利用できるので、2回目以降はAPI呼び出しゼロ。

## 実使用例③ サムネ品質スコアリング（viability_score）

生成したサムネイル案が「競合チャンネルっぽいか」をEmbeddingで数値化している。

手順：競合8チャンネル317枚のサムネをEmbeddingしてcentroid（重心ベクトル）を計算。新規生成したサムネをEmbeddingして、centroidとのコサイン類似度をviability_scoreとする。

実際のスコア結果：案1はviability_score=**0.8685**、案2は0.8243、案3は0.8273。→ 案1を自動推薦。0.85以上が「競合テイストに近い＝CTR期待値高い」の目安として運用中。3案を自動生成してスコア順ランキングし、最高スコアを推薦する流れをパイプラインに組み込んだ。

## 実使用例④ 競合サムネ傾向分析

8チャンネルそれぞれのcentroidを計算すると、チャンネルごとの「サムネテイスト」が数値で比較できる。自分のサムネがどのチャンネルに一番近いか、逆にどこと差別化できているか、が定量的にわかる。

ただし「Embeddingスコアが高い＝見た目が良い」ではない。実際にこれをやって0.87のスコアが出たのに、競合と並べたら「キャラが明らかに小さい」と気づいた。競合は画面の80〜90%をキャラが占めているのに、自分のパイプラインは最大68%だった。視覚的インパクトの「肌感覚」は人間が目で見ないとわからない。Embeddingは方向性を測るツールであって、最終判断は人間が担う。

## 実使用例⑤ 漫画ショートの表情自動選択

パネルの場面描写テキストをEmbedding → 各キャラの表情候補と類似度計算 → 最適表情を自動選択。

4枚のパネルで各キャラの最適表情が自動で選ばれる。

コスト: $0.001/実行（テキストEmbeddingのみ）

## 料金と実績

**全部$0**（無料枠内）で回っている。内訳：135枚の立ち絵画像Embedding（9表情×3段階×5キャラの全パターン）、テキストEmbedding数百回（字幕→表情マッチング）、サムネイル案3枚×複数動画のスコアリング、競合317枚のcentroid計算（初回のみ）。

キャッシュ設計が重要。立ち絵画像は`bust_embeddings_cache.json`に保存、centroidは`centroid_cache.json`に保存することで、2回目以降はAPI呼び出しゼロで動く。

注意点：現在プレビュー版のため仕様変更の可能性あり。3072次元が大きすぎる場合はMatryoshka圧縮で768次元に縮小可能。Gemini Files APIへの画像アップロードは48時間有効（再アップロード対策でURIをキャッシュ）。

## まとめ

Embeddingを知る前は「表情選定」をif文とハードコードで書いていた。それで壊れる箇所が必ず出た（前回記事参照）。

Embeddingに切り替えてわかったのは、**「全パターンが事前に列挙できない判断」はEmbeddingの方が圧倒的にうまく扱える**ということだ。表情の選択も、サムネの品質評価も、「文脈を理解した上での類似度判断」が必要な処理だった。

無料枠で動く。数行で書ける。キャッシュすれば繰り返し使える。RAGやエージェントを作る前段階として、まずこの3つの実例から試してみてほしい。

[if文で自動化したら何が壊れたかを書いています](https://note.com/n/ncf467d89cc29)

#AI自動化 #プログラミング #個人開発 #Gemini #Python
