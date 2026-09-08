# proseka-score-sim (Phase2 - 楽曲一覧 + 譜面エディタ)

プロセカスコアシミュレーター Phase2 の第一歩。CSVから楽曲一覧を読み込んで検索・
並べ替えできる一覧ページと、Googleドライブに置いた譜面txtの読み書き、そして
Phase1の譜面エディタを一覧画面に統合した編集モードを内包しています。
Next.js(Pages Router) + TypeScript。

## ローカルで動かす

```bash
npm install
npm run dev
```

`http://localhost:3000` を開き、CSVのURLを入力して「読み込む」を押してください。
動作確認用に `public/sample.csv` を同梱しているので、`http://localhost:3000/sample.csv`
と入力すればサンプルデータで表示を確認できます。曲名・サブタイトルでの検索欄も
一覧の上に出ます。

## CSVの形式(A〜K列, 11列)

1行目はヘッダー行として無視されます(見出し文字列自体は見ていません)。

| 列 | 内容 |
| - | - |
| A | 曲ID |
| B | 曲名 |
| C | サブタイトル |
| D | EASYレベル |
| E | NORMALレベル |
| F | HARDレベル |
| G | EXPERTレベル |
| H | MASTERレベル |
| I | APPENDレベル(存在しない曲は `-` ) |
| J | ジャケット画像のURL |
| K | 譜面ファイル名(Googleドライブ内のtxtファイル名。拡張子込み) |

## Googleドライブとの連携(読み書き両対応)

CSVのK列には「ファイル名」だけを書きます(URLではありません)。実際のファイル本体は
指定した1つのGoogleドライブフォルダにまとめて置いておきます。編集して保存する
機能があるため、単なるAPIキーではなく**サービスアカウント**で認証し、そのフォルダを
サービスアカウントの持ち主として読み書きします。

セットアップ手順:

1. 譜面txtをまとめて入れる専用フォルダをGoogleドライブに作る
2. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作り、
   **Google Drive API** を有効化する
3. 「APIとサービス」→「認証情報」からサービスアカウントを作成し、鍵(JSON)を発行する
4. 発行されたJSONの中の `client_email` と `private_key` を控える
5. 手順1で作ったドライブフォルダを、`client_email` のアドレスに対して
   **「編集者」として共有**する(フォルダを公開設定にする必要はありません。
   サービスアカウントだけがアクセスできる状態でOKです)
6. フォルダを開いたときのURL末尾の文字列(フォルダID)を控える
7. 環境変数として以下を設定する(ローカルなら `.env.local`、Vercelならプロジェクトの
   Environment Variables)

```
GOOGLE_DRIVE_FOLDER_ID=フォルダID
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxxx@xxxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n"
```

`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` はJSON鍵の中の `private_key` の値をそのまま
貼り付けてください(`\n` はリテラル文字列のままでOKで、アプリ側で実際の改行に
変換しています)。

一覧画面で曲を選択すると、譜面ファイル名の右に「Driveから読み込みテスト」ボタンが
出るので、そこで実際に取得できるか確認できます。

## 編集モード(エディタ統合)

以前は `/editor` という別ページにPhase1の譜面エディタを隔離していましたが、今は
一覧画面そのものに統合しています。

- 右下の `edit` リンクからパスワードを入力してログインすると、一覧画面がそのまま
  「編集モード」になります(ページ遷移せず同じ画面に戻ります)
- 編集モード中は、各曲の難易度バッジの左側に鉛筆アイコン(✎)が表示されます
  (譜面ファイル名が設定されていない曲は押せません)
- 鉛筆を押すと、その曲の譜面ファイルをDriveから読み込んだ状態でPhase1エディタが
  画面いっぱいに開きます(内部的には `public/tools/chart-editor.html` を
  iframeで表示し、`postMessage` で内容を受け渡ししています)
- エディタ上部の「保存」ボタンを押すと、編集内容がそのままDrive上の同名ファイルに
  上書き保存されます
- 認証は `EDITOR_PASSWORD` 環境変数で設定したパスワードと、httpOnLyの認証Cookie
  (30日間有効)によるものです。`middleware.ts` がエディタの静的ファイル
  (`/tools/chart-editor.html`)への直接アクセスも保護しており、保存API
  (`PUT /api/chart`)も未認証では拒否されます

```
EDITOR_PASSWORD=好きなパスワード
```

これはあくまで簡易的な保護です。本格的に守りたい場合は、Vercelのアカウント単位の
アクセス制限や、NextAuthなどによるユーザー単位の認可に切り替えることもできます。
今の実装は「なるべく手間をかけずに第三者アクセスを防ぐ」という優先度で選びました。

## なぜAPIルート(`/api/songs`)を経由しているか

ブラウザから直接CSVのURLへfetchすると、CSVの配信元がCORSを許可していない場合に
読み込めないことがあります。Next.jsのサーバー側(`pages/api/songs.ts`)でCSVを取得・
パースしてからJSONとして返すことで、この問題を回避しています。

## 一般ユーザー向けページ

- `/` : 楽曲一覧(CSVのURLを入れて曲を探す)
- `/guide` : 使い方の説明ページ(一般公開してよい内容。エディタ機能には一切触れていません)
- `/simulate/[曲ID]` : スコアシミュレート画面

## Vercelへのデプロイ

1. このプロジェクトをGitHubリポジトリにpushする
2. [Vercel](https://vercel.com) でそのリポジトリをImportする(Next.jsは自動検出されるので設定不要)
3. Project Settings → Environment Variables に `GOOGLE_DRIVE_FOLDER_ID` /
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` /
   `EDITOR_PASSWORD` を設定する
4. デプロイ完了後のURLで動作します

## 現状のスコープ

- CSVから曲一覧を取得して、ジャケット・曲名/サブタイトル・各難易度レベルのバッジ付きで
  一覧表示
- 曲名・サブタイトル・曲IDでの検索、各難易度レベル/曲ID(数値順)/曲名での並べ替え
- 曲をクリックすると選択状態になり、譜面ファイル名とDriveからの読み込みテストが可能
- パスワード認証つきの編集モード。各曲の鉛筆アイコンからPhase1エディタを開き、
  Drive上の譜面txtを読み書き保存できる

## 未実装・今後の検討事項

- 選択した曲の譜面データを実際に譜面ビューアー・スコアシミュレーションへ渡す導線
  (今のところ編集モードの保存導線のみ)
- 曲名でのあいうえお順ソート(現状はUnicodeコードポイント順)
- 保存の競合(複数人が同時に同じファイルを編集した場合の上書き事故)への対応
