# seiza

**seiza** は、夜空を見渡して星を探し、自分だけの星座を作る探索ゲームです。Expo / React Native で開発中です。

通常モードでは全天球の空を見ながら星の密度を手がかりに方向を探します。望遠鏡モードでは狭い視野とダウジングを頼りに星を発見・登録できます。登録した星を結び、手描きの外形や顔スタンプ、名前を加えて星座を完成させます。完成作品は現在の空に現れ、図鑑から後で見返せます。

## 開発・起動

```bash
npm install
npx expo start
```

表示された案内から iPhone の Expo Go、シミュレーター、または Web で開けます。ジャイロ操作やタッチ操作の確認には実機を推奨します。

```bash
npx tsc --noEmit
npx expo lint
npm run test:domain
npm run test:constellation
npm run test:artwork
```

現在は端末内へのローカル保存を使用します。Supabase・認証・クラウド同期は未実装です。詳しい仕様は [`docs/game-design.md`](docs/game-design.md) と [`docs/architecture.md`](docs/architecture.md) を参照してください。
