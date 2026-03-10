# GPT-5.4 公式情報調査メモ

調査日: 2026-03-07
調査者: ashigaru2 (subtask_284a)

## 公式発表概要

- **発表日**: 2026年3月5日
- **発表元**: OpenAI
- **公式ページ**: https://openai.com/index/introducing-gpt-5-4/
- **位置づけ**: 「プロフェッショナルワーク向け最高性能・効率フロンティアモデル」
- GPT-5.2 Thinkingの後継として位置づけられ、3ヶ月後にGPT-5.2 Thinkingは廃止予定

## 主要新機能・改善点

- **3バリアント展開**:
  - GPT-5.4 Standard（標準版）
  - GPT-5.4 Thinking（高度推論モデル）
  - GPT-5.4 Pro（エンタープライズ向け高性能版）

- **コンピューター使用（Computer Use）**: 初の汎用モデルへのネイティブPC操作機能搭載。スクリーンショット・マウス・キーボード操作でアプリを直接制御可能。CodexおよびAPIで提供。

- **Tool Search**: 多ツール環境でのAPI呼び出しを高速・低コスト化する新ツール定義検索システム。多数のツール定義をあらかじめ読み込まず必要時にルックアップ。

- **トークン効率向上**: GPT-5.2比で同等問題を大幅に少ないトークンで解決。

- **精度向上**:
  - 個別クレームの誤り率: GPT-5.2比33%削減
  - レスポンス全体の誤り率: 18%削減

- **コーディング強化**: GPT-5.3-codexのコーディング能力をメインラインモデルに統合。

## 性能・ベンチマーク

| ベンチマーク | GPT-5.4 | GPT-5.2 | GPT-4o (参考) | 備考 |
|-------------|---------|---------|--------------|------|
| GDPval（44職種プロ業務） | **83%** | 70.9% | ~12% | 人間専門家水準以上の割合 |
| OSWorld-Verified（コンピューター操作） | **75.0%** | 47.3% | — | 人間パフォーマンス72.4%を超過 |
| BrowseComp（情報検索） | **89.3%** | — | — | Gemini 3.1 Pro・Claude Opus 4.6を超過 |
| SWE-Bench Pro Public（コーディング） | **57.7%** | — | — | Gemini 3.1 Pro(54.2%)を超過 |
| MMMU-Pro（視覚理解・論理） | **81.2%** | 79.5% | — | |
| OmniDocBench（文書解析）平均誤差率 | **0.109** | 0.140 | — | 低いほど良い |

### 競合他社比較（2026年3月時点フラッグシップモデル）

| 評価軸 | GPT-5.4 | Claude Opus 4.6 | Gemini 3.1 Pro |
|--------|---------|----------------|----------------|
| 知識ワーク・PC操作 | **最強** | 良好 | 良好 |
| コーディング(SWE) | 良好 | **最強** (80.8%) | 良好 |
| 抽象推論 | 良好 | 良好 | **最強** (ARC-AGI-2: 77.1%) |
| コスパ | 中程度 | 中程度 | **最良** |

- Claude Opus 4.6はSWE-Bench Verified 80.8%・MMMU Pro 85.1%でコーディング・視覚推論リード
- Gemini 3.1 ProはGPQA Diamond 94.3%・ARC-AGI-2 77.1%で抽象推論リード（価格も最安）

## 料金体系

### API価格（2026年3月時点）

| モデル | 入力 (1Mトークン) | 出力 (1Mトークン) | 備考 |
|--------|-----------------|-----------------|------|
| GPT-5.4 Standard | $2.50 | $15.00 | 272K以下のコンテキスト |
| GPT-5.4 Standard（大コンテキスト） | $5.00 | $15.00 | 272Kトークン超過時 |
| GPT-5.4 Pro | $30.00 | $180.00 | OpenAI最高単価 |

- データレジデンシー・リージョナル処理エンドポイントは上記に+10%
- GPT-5.4のトークン効率向上により、実質コストはGPT-5.2比で低下の可能性あり

### ChatGPTサブスクリプション

- **GPT-5.4 Thinking**: Plus・Team・Pro ユーザー向けに提供
- **GPT-5.4 Pro**: Enterprise・Edu ユーザー向け（API経由でも提供）
- GPT-5.2 Thinkingは3ヶ月後に廃止予定

## 技術仕様

| 仕様項目 | 詳細 |
|----------|------|
| コンテキスト長 | 最大1.05Mトークン（API版） |
| 入力コンテキスト | 922K tokens |
| 出力トークン | 128K tokens |
| モダリティ | テキスト + 画像（マルチモーダル） |
| コンピューター操作 | ネイティブ対応（Codex・API） |
| GitHub Copilot | 一般提供済み（2026-03-05） |

## マルチモーダル機能

- **高解像度画像処理**: 1000万ピクセル以上の画像を圧縮なしでアップロード可能（詳細情報の損失を防止）
- 前世代比で画像含むプロンプト処理が大幅向上
- コンピューター操作タスクでの視覚理解が特に強化
- ビジョン性能:
  - OSWorld-Verified: 75%（人間の72.4%超え）
  - MMMU-Pro: 81.2%
  - OmniDocBench平均誤差率: 0.109（改善）

## 利用可能時期・対象ユーザー

- **リリース日**: 2026年3月5日（即日一般提供）
- **ChatGPT**: Plus・Team・Pro（GPT-5.4 Thinking）、Enterprise・Edu（GPT-5.4 Pro）
- **OpenAI API**: 全開発者向けに即日提供（context: 1M tokens）
- **GitHub Copilot**: 2026-03-05より一般提供
- **Codex**: コンピューター操作機能含め提供

## 参照URL

- [Introducing GPT-5.4 | OpenAI](https://openai.com/index/introducing-gpt-5-4/)
- [GPT-5.4 Model | OpenAI API](https://developers.openai.com/api/docs/models/gpt-5.4)
- [OpenAI launches GPT-5.4 with Pro and Thinking versions | TechCrunch](https://techcrunch.com/2026/03/05/openai-launches-gpt-5-4-with-pro-and-thinking-versions/)
- [OpenAI launches GPT-5.4 for enterprise work | Fortune](https://fortune.com/2026/03/05/openai-new-model-gpt5-4-enterprise-agentic-anthropic/)
- [GPT-5.4 is generally available in GitHub Copilot](https://github.blog/changelog/2026-03-05-gpt-5-4-is-generally-available-in-github-copilot/)
- [OpenAI launches GPT-5.4 with computer vision, tool use enhancements | SiliconANGLE](https://siliconangle.com/2026/03/05/openai-launches-gpt-5-4-computer-vision-tool-use-enhancements/)
- [OpenAI's GPT-5.4 sets new records on professional benchmarks | The Next Web](https://thenextweb.com/news/openai-gpt-54-launch-computer-use-benchmarks)
- [GPT-5.4 vs Claude Opus 4.6 vs Gemini 3.1 Pro | Evolink](https://evolink.ai/blog/gpt-5-4-vs-claude-opus-4-6-vs-gemini-3-1-pro-2026)
- [Pricing | OpenAI API](https://openai.com/api/pricing/)
