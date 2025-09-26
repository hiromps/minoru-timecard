import express from 'express';
import cors from 'cors';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { initializeDatabase, migrateDatabase } from './database/database';
import employeeRoutes from './routes/employeeRoutes';
import timeRecordRoutes from './routes/timeRecordRoutes';
import adminRoutes from './routes/adminRoutes';
import { ipRestriction, adminIPRestriction } from './middleware/ipRestriction';

// 環境変数の読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS設定（本番環境では特定のドメインのみ許可）
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};

// ミドルウェア
app.use(cors(corsOptions));
app.use(express.json());
app.set('trust proxy', true); // IPアドレス取得のため

// IP制限を適用（本番環境のみ）
if (process.env.NODE_ENV === 'production') {
  app.use(ipRestriction);
}

// データベース初期化
initializeDatabase();

// データベースマイグレーション（複合ステータス対応）
migrateDatabase();

// ルート（API）
app.use('/api/employees', employeeRoutes);
app.use('/api/time-records', timeRecordRoutes);
app.use('/api/admin', adminIPRestriction, adminRoutes); // 管理者APIには追加の制限

app.get('/', (req, res) => {
  res.json({ message: 'ミノルタイムカードシステム API' });
});

// HTTPSサーバーの設定（本番環境）
if (process.env.HTTPS_ENABLED === 'true' && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH)
    };
    
    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`HTTPSサーバーがポート${PORT}で起動しました（セキュアモード）`);
    });
  } catch (error) {
    console.error('SSL証明書の読み込みエラー:', error);
    console.log('HTTPモードで起動します...');
    app.listen(PORT, () => {
      console.log(`HTTPサーバーがポート${PORT}で起動しました（非セキュアモード）`);
    });
  }
} else {
  // HTTPサーバー（開発環境）
  app.listen(PORT, () => {
    console.log(`サーバーがポート${PORT}で起動しました`);
  });
}