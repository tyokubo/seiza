# 星座ゲーム：設計書セットの導入方法

このZIPは **Expo公式テンプレートに追加する設計書セット** です。実行可能なExpoプロジェクト全体ではありません。

## 使い方

1. Expo公式テンプレートを生成します（すでに作成済みなら不要）。

   ```bash
   npx create-expo-app@latest constellation-game --template default
   cd constellation-game
   ```

2. ZIP内の `docs/` をプロジェクト直下にコピーします。
3. **重要：Expoテンプレートがすでに `AGENTS.md` を生成している場合は、ZIP内の `AGENTS.md` で上書きしないでください。** ZIP側の内容を既存ファイルの末尾に追記・統合してください。既存ファイルがなければそのままコピーしてください。
4. Claude Codeを使う場合は、既存の `CLAUDE.md` を維持し、必要なら `AGENTS.md` と `docs/` を読む旨を追記します。`CLAUDE.md` の新規作成は必須ではありません。
5. Codexに `AGENTS.md` と `docs/` を読ませ、`docs/tasks.md` のフェーズ1から実装を依頼してください。

## 内容物

- `AGENTS.md`：プロジェクト固有のAI向け開発ルール（既存ファイルと統合すること）
- `docs/game-design.md`：ゲーム体験、合意済み仕様、未決定事項
- `docs/architecture.md`：推奨技術構成、責務分離、MVP構成
- `docs/data-model.md`：データモデル、月替わり・図鑑の保存方針
- `docs/tasks.md`：段階別の実装タスク、完了条件、検証項目

## 最初のCodex指示文

> AGENTS.mdとdocs/の各ファイルを読んでください。Expo公式テンプレートの既存設定を尊重しながら、docs/tasks.mdのフェーズ1だけ実装してください。未決定の仕様を勝手に確定しないでください。探索ロジックは描画と分離し、型チェックと可能な範囲のテストを実施してください。実機でしか確認できない部分は未検証と明記してください。

設計書の数値例は調整用の仮値であり、確定したゲームバランスではありません。
