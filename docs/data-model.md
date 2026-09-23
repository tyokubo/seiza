# データモデル（設計案）

この文書は**実装案**です。DBのテーブルを直ちに全て作る指示ではありません。月別星空と図鑑の整合性を保つための共通モデルです。

## 1. 基本型の例

```ts
type Id = string;
type PeriodKey = string; // 'YYYY-MM'。月境界のタイムゾーンは後で確定

type Point2D = { x: number; y: number };

type Star = {
  id: Id;               // 星空の中で一意
  position: Point2D;    // 世界座標（描画ピクセルとは別）
  brightness: number;   // 表示上の属性。物理的な等級とは限らない
};

type Sky = {
  id: Id;
  periodKey: PeriodKey;
  generatorVersion: number;
  seed?: string;
  stars: Star[];        // 過去の完全再現が必要なら座標も保存
};

type FaceStamp = {
  type: string;         // original stamp ID
  position: Point2D;
  scale: number;
  rotation: number;
};

type Constellation = {
  id: Id;
  skyId: Id;
  name: string;
  outlineStarIds: Id[]; // 並び順が線の順序
  isClosed: boolean;    // 外形の閉じ方はUI仕様で調整
  faceStamp?: FaceStamp;
  createdAt: string;    // ISO 8601
  schemaVersion: number;
};

type PlayerSkyProgress = {
  skyId: Id;
  discoveredStarIds: Id[];
  // 未完成作品や探索時間は仕様確定時に追加
};
```

## 2. IDと座標のルール

- 星のIDは、別の月の星と偶然衝突しないよう `skyId` と組み合わせて扱う。
- データ上の座標と画面ピクセルを区別する。通常/望遠鏡モードで同じ星を参照できるようにする。
- 星座はその星空に属する星のIDを参照する。星座だけを保存する際も、最低限、再描画に必要な星座構成点の座標スナップショットを保持する案を検討する。
- 同じ星を複数星座で利用できるかは未決定。モデルで強制しない。

## 3. 月替わり

- `periodKey`が変わったら次月の `Sky` を取得または生成する。
- 旧月の `Sky` と `Constellation` を即削除しない。現行表示対象だけ切り替える。
- 完成した星座は月替わり後も図鑑に残す。
- 星の座標を含む月別星空全体のアーカイブは追加候補。保存しないMVPでも、星座詳細の再描画に必要な座標は失わない。
- seedによる再生成はアルゴリズム変更で結果が変わり得る。`generatorVersion`を付ける。完全再現が必要なら生成済み座標も保存する。
- 日付判定はテスト可能な関数にし、実行時の時刻/タイムゾーンを注入可能にする。月替わりのタイムゾーンは別途決定する。

## 4. 保存先の段階的導入

1. 探索MVP：メモリ上の固定/生成データのみ。
2. 図鑑MVP：端末ローカル保存（例：SQLite）。
3. クラウド同期：Repository経由でSupabaseを追加。

Supabaseを採用する場合の論理的な保存単位：`skies`、`constellations`、`user_sky_progress`。具体的な列、RLS、匿名認証方針はクラウド実装時に決める。未決定の仕様のために先にマイグレーションを作らない。

## 5. 変更耐性

- セーブ形式に`schemaVersion`を持たせる。
- スタンプ種類は表示名ではなく安定したIDを使う。
- 月別の空を図鑑から再表示できるよう、`skyId`との関連を保つ。
- リセットや月更新で履歴を誤削除しないよう、データ削除とアクティブ期間の切り替えを分離する。
