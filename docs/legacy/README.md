# レガシー資料（廃止済み・歴史的資料）

このディレクトリには、**現行システムでは使用されていない旧構成のドキュメント**を保管しています。
いずれも歴史的経緯の参照用であり、**現行の正典ではありません**。

## 現行の正典

現行システムの実態は「**React SPA（Create React App）+ Supabase + Vercel**」です。
最新かつ正確な情報は、以下を参照してください。

- リポジトリ直下 [README.md](../../README.md) — プロジェクト概要
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — システム構成
- [docs/DATA_MODEL.md](../DATA_MODEL.md) — データモデル
- [docs/SECURITY.md](../SECURITY.md) — セキュリティ設計
- [docs/DEPLOYMENT.md](../DEPLOYMENT.md) / [docs/OPERATIONS.md](../OPERATIONS.md) — デプロイ・運用
- [docs/ADMIN_GUIDE.md](../ADMIN_GUIDE.md) / [docs/USER_GUIDE.md](../USER_GUIDE.md) — 操作マニュアル
- [docs/ENVIRONMENT.md](../ENVIRONMENT.md) — 環境変数
- [docs/KNOWN_ISSUES.md](../KNOWN_ISSUES.md) — 既知の課題

## なぜレガシーなのか

本プロジェクトは当初、**Node.js + Express + SQLite** のバックエンドを持ち、**社内LAN内で IP 制限**して運用する構成でした。
その後、**ブラウザから直接 Supabase（PostgreSQL + Auth + RLS）に接続する構成へ移行**し、配信も **Vercel（静的SPA）** へ変わりました。
この移行により、下記の旧ドキュメントが記述する前提（SQLite、Express サーバー、ポート 3001、`timecard.db`、PM2/Nginx、`allowed-ips.json` による IP 制限など）は、現行では成立しません。

## 保管しているファイル

| ファイル | 旧内容の概要 | 現行の対応ドキュメント |
|---|---|---|
| `README_USAGE.md` | 旧・利用/運用マニュアル（SQLite/Express/PM2） | [ADMIN_GUIDE.md](../ADMIN_GUIDE.md) / [USER_GUIDE.md](../USER_GUIDE.md) |
| `NETWORK_SETUP.md` | 社内LAN構成・IP制限・ファイアウォール設定 | [SECURITY.md](../SECURITY.md)（ネットワーク保護の考え方） |
| `SECURITY_GUIDE.md` | 旧セキュリティ設計（LAN/Express前提） | [SECURITY.md](../SECURITY.md) |
| `ENHANCED_SECURITY_GUIDE.md` | Supabase強化セキュリティ（内容は現行寄り） | [SECURITY.md](../SECURITY.md) に統合 |
| `SECURITY_IMPLEMENTATION_SUMMARY.md` | セキュリティ実装サマリ | [SECURITY.md](../SECURITY.md) に統合 |
| `SECURITY_DEPLOYMENT_CHECKLIST.md` | 旧デプロイ用チェックリスト | [DEPLOYMENT.md](../DEPLOYMENT.md) / [OPERATIONS.md](../OPERATIONS.md) |
| `ADMIN_SETUP.md` | 管理者作成手順（SQLite `admins` テーブル） | [ADMIN_GUIDE.md](../ADMIN_GUIDE.md) / [SECURITY.md](../SECURITY.md) |
| `SUPABASE_SETUP.md` | 旧Supabaseセットアップ手順 | [DEPLOYMENT.md](../DEPLOYMENT.md) |
| `INCORRECT_PUNCH_CORRECTION_GUIDE.md` | 打刻修正の生SQL手順 | [ADMIN_GUIDE.md](../ADMIN_GUIDE.md)（UI操作へ翻案） |
| `create-admin-user.js` | 旧SQLite用の管理者作成スクリプト（`backend/timecard.db` を参照） | 現行はSupabase Authで管理（[SECURITY.md](../SECURITY.md)） |

## レガシーコード `backend/` について

リポジトリ直下の **`backend/`（Express 4 + SQLite3）ディレクトリは廃止済み（retired）** です。
デプロイも、フロントエンドからの呼び出しも行われていません。

- **削除はせず**、歴史的経緯の参照用として残しています。
- **新規作業で `backend/` を復活・参照・デプロイしないでください。**
- 弱い `JWT_SECRET` 既定値など既知の懸念は [KNOWN_ISSUES.md](../KNOWN_ISSUES.md) を参照。未デプロイのため現行稼働への実害はありません。
