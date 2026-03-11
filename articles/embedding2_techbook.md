技術書PDF 50冊をAIに食わせたら、図表もコード例も全部横断検索できるようになった

手持ちの技術書PDFが50冊を超えた。

O'Reillyのサブスク、技術書典の戦利品、会社の輪読会で買ったやつ。全部PDFで持っている。でも**検索できない**。

「あのデザインパターンのクラス図、どの本の何ページだっけ？」

PDF内テキスト検索では図表がヒットしない。Notion に読書メモを書いても、図やコード例は貼ってない。結局「たしかあの赤い表紙の本に……」と記憶を頼りに1冊ずつ開き直す。

これをどうにかしたかった。

![50冊のPDF技術書がAIによってベクトル化され横断検索できるシステムのイメージ図](../images/embedding2_techbook_cover.png)

## Gemini Embedding 2でPDFごと食わせる

Googleが出した「Gemini Embedding 2」が使えそうだった。

このモデルの特徴は**マルチモーダルEmbedding**。テキスト・画像・PDF・音声・動画を同じベクトル空間に埋め込める。つまり、テキストで検索して**PDFの図表ページ**がヒットする。

スペックをまとめると：

- **入力**: テキスト / 画像(6枚) / PDF(6ページ) / 音声(80秒) / 動画(80〜120秒)
- **次元**: 3072（Matryoshkaで768/1536に縮小可）
- **入力上限**: 8192トークン
- **料金**: 無料枠あり。有料でもテキスト$0.20/100万トークン
- **タスクタイプ**: RETRIEVAL / SEMANTIC_SIMILARITY / CLASSIFICATION / CLUSTERING / CODE_RETRIEVAL / QA / FACT_VERIFICATION

PDFは6ページずつしか食えないので、チャンク分割が必要。ここがキモ。

## 実装イメージ

構成はシンプル。

```
技術書PDF群 → PyMuPDFで6Pずつ分割 → google-genai SDKでembed → FAISSに格納
検索クエリ(テキスト) → embed → FAISS検索 → 該当PDFのページ番号+内容を返却
```

使うもの：

- `google-genai` SDK（Gemini API）
- `PyMuPDF`（PDF分割。pikepdfやPyPDF2より高速）
- `FAISS`（ベクトル検索。50冊程度ならローカルで十分）
- Streamlit（検索UI。なくてもCLIで動く）

embedの呼び出しは5行で終わる：

```python
from google import genai
client = genai.Client()
result = client.models.embed_content(
    model="gemini-embedding-2-preview",
    contents=[pdf_chunk],  # PDFバイナリ or テキスト
    config={"task_type": "RETRIEVAL_DOCUMENT"}
)
vector = result.embeddings[0].values  # 3072次元
```

検索時は`task_type="RETRIEVAL_QUERY"`に変える。ドキュメント側とクエリ側でタスクタイプを分けるのがGemini Embedding 2のお作法。

## 面白いのは「図で探せる」こと

テキスト検索との決定的な違いは**図表がヒットする**こと。

「Observer パターンのクラス図」で検索すると、GoF本の該当ページが返ってくる。図の中の矢印やクラス名をOCRで読み取り、かつ図としての構造も「意味」として理解している（らしい）。

コード例も同様。`if err != nil { return err }` というGoのイディオムで検索すると、エラーハンドリングの解説ページがヒットする。`CODE_RETRIEVAL`タスクタイプを使えばコードの意味検索に最適化される。

## Matryoshka表現が地味に便利

3072次元のベクトルを768次元に切り詰められる（Matryoshka表現）。

50冊（約1500チャンク）なら3072次元でも問題ないが、蔵書が増えたときにインデックスサイズが4倍違ってくる。「とりあえず3072で保存→後から768に縮小」ができるので、最初から次元選択を悩まなくていい。

FAISSのflatインデックスなら、768次元×1500チャンクで約4.5MB。ノートPCのメモリに余裕で乗る。

## ハマりポイント

**PDF 6ページ制限**: 1チャンク6ページまで。章の途中で切れると文脈が失われる。目次ページから章区切りを取得して、章単位で分割するのがベター。

**プレビュー版**: 本番で使うにはリスクあり。個人のナレッジベースなら問題ない。

**日本語PDF**: OCR精度は英語の方が高い印象。技術書は英語が多いので実害は少ないが、日本語オンリーの本は精度検証が必要。

**FAISS vs pgvector**: 50冊ならFAISS一択。500冊超えたらSupabase pgvectorに移行を検討。

## まとめ

技術書PDFの横断検索、今まで不可能だったことが「図表もコード例も含めて全部検索できる」レベルになった。

実装は週末1日で終わる。Python + FAISS + google-genai SDKの3点セット。無料枠で十分動く。

「あの図、どの本だっけ」が5秒で解決する体験は、一度味わうと戻れない。

#Python #FAISS #GeminiEmbedding #マルチモーダル #RAG #PDF検索 #技術書 #エンジニア #個人開発
