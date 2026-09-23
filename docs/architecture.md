# 技術設計・ディレクトリ方針

## 目的

早く触れるプロトタイプを作りつつ、視点操作／描画／探索／保存の変更が互いに波及しにくい構成にする。大規模なClean Architectureの雛形は不要。

## 推奨スタック

- TypeScript / React Native / Expo / Expo Router
- 星と線の描画：まず必要性を検証し、React Native Skiaを優先候補とする（初期に不要なら導入を先送り）。
- センサー：expo-sensors（ジャイロ対応段階で導入）
- 振動：expo-haptics（実機検証段階で導入）
- 保存：MVPはローカル、クラウド同期が必要になったらSupabase
- テスト：純粋関数の単体テストを優先。テストランナーは採用時に選定する。

## ディレクトリ例（段階的に追加）

```text
src/
  app/                          # Expo Router：画面・ルート
    _layout.tsx
    index.tsx
    explore.tsx
    create.tsx
    library/
      index.tsx
      [id].tsx
  features/
    sky/
      domain/
        types.ts
        generateSky.ts
        coordinates.ts
      components/
        SkyCanvas.tsx
    exploration/
      domain/
        camera.ts
        dowsing.ts
        discovery.ts
      components/
        TelescopeView.tsx
        DowsingIndicator.tsx
      hooks/
        useExploration.ts
    constellation/
      domain/
        types.ts
        editor.ts
      components/
        ConstellationEditor.tsx
        FaceStampPicker.tsx
    library/
      components/
    monthly-sky/
      domain/
        period.ts
        rollover.ts
  services/
    sensors/                      # 導入時に追加
    storage/                      # repository実装
    supabase/                     # 導入時に追加
  config/
    gameConfig.ts
  components/
    ui/
assets/
  stamps/
  sounds/
docs/
  game-design.md
  architecture.md
  data-model.md
  tasks.md
```

**上記は完成時の見取り図であり、空ディレクトリ・空ファイルを一括作成しない。** Expoテンプレート既存の `app/` / `src/app/` 位置や依存関係は確認して合わせる。

## 依存の向き

- `domain/` はTypeScriptのみ。React・描画ライブラリ・Supabaseをimportしない。
- 描画コンポーネントは、カメラ状態と星データから描画する。保存処理を直接呼ばない。
- 入力層はスワイプやセンサー値をカメラ操作へ変換する。ドメインが入力デバイスを知らないようにする。
- 画面・hookはドメイン・描画・保存を組み合わせる。
- 保存APIはRepositoryを窓口にする。Supabaseを全画面から直接呼ばない。
- ドメイン間の共通化は実際に必要になってから行う。

## カメラ仕様の重要な区別

- カメラには視点位置/方向と表示モードがある。
- `normal`と`telescope`は**入力感度と視野サイズ**が違う。
- `telescope`の可動範囲そのものは制限しない。
- モード切り替えで視点を維持する。
- カメラ計算は描画ピクセルと独立した世界座標で行う。

仮の設定例（**数値未確定**）：

```ts
export const gameConfig = {
  normalSwipeSensitivity: 1,
  telescopeSwipeSensitivity: 0.2,
  dailyExplorationSeconds: 180,
} as const;
```

## データフロー

```text
スワイプ/ジャイロ（将来）
  -> 操作変換
  -> カメラ状態の更新
  -> 視野・対象星・距離/方向の計算
  -> 星空の描画 / ダウジング表示
  -> 発見イベント
  -> セーブ処理（導入段階で）
```

`camera.ts`、`dowsing.ts`、`discovery.ts`はReact外でテスト可能にする。

## 永続化と更新

- 各月の星空を `skyId` / `periodKey` で区別する。
- 星座は星のID群・線の順序・顔スタンプの設定を構造化データで保持する。
- ローカル保存から開始し、将来のRepository実装を差し替え可能にする。
- 月替わりは旧データを削除する操作ではなく、アクティブな空の切り替えとして実装する。

## 開発・品質ルール

- まず探索プロトタイプを実機で評価し、それから星座制作・図鑑へ進む。
- 設定値を集中管理し、UIからの調整を容易にする。
- 型チェックと、位置・モード切替・ダウジング・月判定の単体テストを優先する。
- iOS/Androidでのセンサー・振動差を考慮し、必須操作はスワイプで成立させる。
- Supabase導入時はRLSと認証済みユーザー範囲のアクセス制御を設計する。秘密鍵はアプリに組み込まない。
