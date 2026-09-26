# 探索・星座制作の変更報告

2026-09-26。今回の変更ではExpo設定・依存パッケージ・全天球座標・ジャイロ処理を変更していない。

## 実装内容

- 左下は図鑑、右下は制作入口。右下の有効化は未使用星2個以上または既存星座の編集候補で判定する。
- 制作開始時に新規または既存星座を選ぶ。画面上の名前領域と一覧から選択できる。開始後は1作品に固定し、他作品は同じ位置に25%で参照表示する。
- 同一の月・星空では星の所属を共有できない。新作は未使用星、編集は自分の星と未使用星だけ扱う。操作候補と保存時の両方で検証する。
- 作業内容はメモリだけで管理し、自動保存しない。完成・保存の成功後に作品と所属を更新する。失敗時は作業を保持する。破棄確認では新作を残さず、編集前の確定状態を保持する。
- 描画中は1本指で線、2本指で移動とズーム。途中で2本指になった場合は仮線を破棄する。
- 顔上の2本指操作は顔の回転・拡縮・移動に固定し、背景を動かさない。顔外ではキャンバス操作となる。
- Undo/Redoを右上の独立した56pxボタンへ移動し、目・虫眼鏡は下部に維持する。
- 手描き線は一定間隔の接平面サンプルとストロークIDから微細な濃淡・輪郭を生成する。描画中と保存後の粒状感は同じになる。
- 望遠鏡の星・発光・登録表示を2倍にし、タップ半径を32pxにする。視野外からのタップは受け付けない。

## 変更ファイル

- `src/app/explore.tsx`, `create.tsx`, `library.tsx`
- `src/config/gameConfig.ts`
- `src/features/constellation/ConstellationProvider.tsx`
- `src/features/constellation/components/ConstellationButton.tsx`
- `src/features/constellation/components/ConstellationSelection.tsx`（追加）
- `src/features/constellation/components/ConstellationDraft.tsx`
- `src/features/constellation/components/ConstellationNameDialog.tsx`
- `src/features/constellation/components/ArtworkLayer.tsx`
- `src/features/constellation/hooks/useArtworkGestures.ts`
- `src/features/constellation/domain/ownership.ts`（追加）
- `src/features/constellation/domain/touchTransform.ts`（追加）
- `src/features/constellation/domain/brushTexture.ts`（追加）
- `src/features/constellation/domain/artwork-tests.ts`
- `src/features/sky/components/SkyPanoramaView.tsx`, `SkyCanvas.tsx`
- `docs/game-design.md`, `architecture.md`, `data-model.md`, `tasks.md`, `editor-ux-review.md`, 本書

## 検証結果

- `npx tsc --noEmit`: 成功。
- `npx expo lint`: 成功。
- `npm run test:domain`, `test:constellation`, `test:artwork`: 成功。所属、月別分離、2点変換、回転、テクスチャ再現性の検証を追加。
- ブラウザ: 390x844 / 320x568 / 1280x800で画面と操作を確認。
- 2本指移動・ピンチ・描画中の指追加、顔回転時の背景固定、Undo/Redoの配置、編集対象選択、所属制約、参照表示を確認。
- 新規作業の破棄、既存編集の破棄、保存失敗後の破棄、同じIDでの更新、再読込後の復元を確認。制作中はlocalStorageの作業フィールドが空のままであることも確認。
- 同じ星の明るい描画部分が通常43pxから望遠鏡175pxに増加することをスクリーンショットで確認。
- iOS向け開発バンドル取得成功。これはiPhone実機の描画・操作確認の代わりではない。

## 判断・未検証項目

- 今回の仕様項目は実装済み。iPhone実機でのタッチ・回転の感触、Safe Area、描画負荷は未検証。
- 所属は同一skyId（月を含む）に限る。過去月の図鑑は閲覧でき、今月の制作を制限しない。
- 旧自動保存下書きは新仕様に従い起動時に破棄する。完成作品と登録星は保持する。
- 旧データですでに星を共有している作品は自動削除しない。共有を含む保存は拒否する。
- 制作中に月が変わった場合は保存を拒否し、探索から開始し直す。
- ブラウザ自動検証スクリプトは `/tmp/seiza-revision-check.mjs`。ブラウザの2本指入力はCDPによるエミュレーション。

## 実機で確認してほしい操作

1. ゆっくり描いてから2本指を加え、余分な線が残らず視点移動へ切り替わるか。
2. 顔上で2本指をひねり、背景が動かず、回転・拡縮・領域制約が自然に感じられるか。
3. 左右コーナーと右上Undo/RedoがSafe Area内で押しやすいか。
4. 新規・既存編集の両方で破棄し、元の星空と図鑑が保たれるか。
5. 望遠鏡の星と登録マークの大きさ、線のざらつき・明るさが見やすいか。
