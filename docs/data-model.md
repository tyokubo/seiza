# データモデル（設計案）

この文書は**実装案**です。DBのテーブルを直ちに全て作る指示ではありません。月別星空と図鑑の整合性を保つための共通モデルです。

## 1. 基本型の例

```ts
type Id = string;
type PeriodKey = string; // 'YYYY-MM'。月境界のタイムゾーンは後で確定

type Point2D = { x: number; y: number };

type Star = {
  id: Id;               // 星空の中で一意
  position: Point2D;    // 星面の生成座標。球面方向へ変換してから投影する
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
  connections: { from: Id; to: Id }[]; // 順序を持たない星IDの接続。分岐可能
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
- データ上の座標と画面ピクセルを区別する。星の2D生成座標はステレオ投影で球面方向に変換し、通常/望遠鏡モードで共通のクォータニオンカメラと透視投影を使う。
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

現在はAsyncStorageへ `seiza:sky:<skyId>:v1` キーで次の編集中星座データを保存する。複数作品を扱う図鑑データとは別とする。

```ts
type SkySaveData = {
  schemaVersion: 1;
  skyId: Id;
  registeredStarIds: Id[];
  connections: { from: Id; to: Id }[];
  name: string; // 未命名は空文字。上限40文字
  artwork: Artwork | null;
  library: FinishedConstellation[];
};
```

接続の逆順は同一の線とし、自己接続・重複・未登録/不明な星IDを禁止する。仮線は `{ from, point, snapId? }` の画面状態、Undo/Redoは作業スナップショットとして保持し、永続化しない。作業は1セッション1作品に限定する。

名前は前後の空白を取り除き、連続する空白をまとめて保存する。名前フィールドのない旧v1データは未命名として読み込み、既存の登録星・接続を維持する。

### 外形・顔・完成作品の追加

```ts
type Artwork = {
  frame: { x: number; y: number; z: number; w: number }; // 世界に固定した単位Quaternion
  strokes: { id: string; paths: Point2D[][] }[]; // 領域外で分割済みの接平面座標
  stamps: { id: string; assetId: 'nikoniko'; position: Point2D; size: number; rotation: number }[];
};
type FinishedConstellation = {
  id: string;
  skyId: string; // prototype ID + ':' + YYYY-MM
  periodKey: string;
  starIds: string[];
  stars: Star[]; // 将来の配置変更に依存しない再描画用スナップショット
  connections: { from: string; to: string }[];
  artwork: Artwork;
  name: string;
  createdAt: string;
};
```

保存キーとv1の読み取り互換性を維持する。描画座標・姿勢の有限値、顔ID、星参照、日付を検証し、不正なデータは空データで上書きしない。旧単一stampはID付き配列に移行する。新仕様では作業を永続化しないため、旧自動保存下書きは起動時に破棄し、完成作品・登録星は維持する。旧下書き用トップレベルconnections/name/artwork/editingIdは空値のみ書き込む。

編集対象ID・作業名・接続・絵・顔・履歴は画面のメモリのみで管理する。明示保存時に、同一skyIdの他作品のstarIdsとの非重複と登録状態を検証する。新作は追加、編集は同じIDを置き換え、元の作成日時を保持する。保存成功前に確定データを変更しない。破棄時は新作を残さず、既存作品と所属を元のまま保持する。所属の索引は完成作品のstarIdsから導出し、作業から更新しない。

画像本体は保存せず共通アセットを参照する。顔の位置・大きさ・回転角を保存する。手描きの粒状感は保存したストロークIDと接平面座標から決定的に再生成する。現在月の表示だけをフィルタし、過去月の作品は削除しない。制作中に月が変わった場合は保存を拒否し、探索から開始し直す。

ユーザーが明示的に削除を確定した作品だけは、IDでライブラリから取り除いて永続化する。自動の月替わり削除とは区別する。手ぶれ補正済み・クリップ済みのストロークのみ保存し、顔のドラッグ中プレビューと消しゴムの削除候補は保存しない。

1. 探索MVP：メモリ上の固定/生成データのみ。
2. 図鑑MVP：端末ローカル保存（例：SQLite）。
3. クラウド同期：Repository経由でSupabaseを追加。

Supabaseを採用する場合の論理的な保存単位：`skies`、`constellations`、`user_sky_progress`。具体的な列、RLS、匿名認証方針はクラウド実装時に決める。未決定の仕様のために先にマイグレーションを作らない。

## 5. 変更耐性

- セーブ形式に`schemaVersion`を持たせる。
- スタンプ種類は表示名ではなく安定したIDを使う。
- 月別の空を図鑑から再表示できるよう、`skyId`との関連を保つ。
- リセットや月更新で履歴を誤削除しないよう、データ削除とアクティブ期間の切り替えを分離する。
