import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// セッション情報を格納するインメモリストア（本番環境ではRedisなどを使用推奨）
interface Session {
  employeeId: string;
  token: string;
  createdAt: Date;
  lastAccessAt: Date;
  ipAddress: string;
}

class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private readonly SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8時間
  private readonly MAX_SESSIONS_PER_EMPLOYEE = 1; // 同一社員の同時セッション数制限

  // セッショントークンの生成
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // セッションの作成
  createSession(employeeId: string, ipAddress: string): string {
    // 既存のセッションを削除（同一社員の複数端末からのアクセスを防ぐ）
    this.removeEmployeeSessions(employeeId);

    const token = this.generateToken();
    const session: Session = {
      employeeId,
      token,
      createdAt: new Date(),
      lastAccessAt: new Date(),
      ipAddress
    };

    this.sessions.set(token, session);
    return token;
  }

  // セッションの検証
  validateSession(token: string, ipAddress: string): Session | null {
    const session = this.sessions.get(token);
    
    if (!session) {
      return null;
    }

    // タイムアウトチェック
    const now = new Date();
    const timeSinceLastAccess = now.getTime() - session.lastAccessAt.getTime();
    
    if (timeSinceLastAccess > this.SESSION_TIMEOUT_MS) {
      this.sessions.delete(token);
      return null;
    }

    // IPアドレスの一致確認（セッションハイジャック対策）
    if (session.ipAddress !== ipAddress) {
      console.log(`セッションIPアドレス不一致: Expected ${session.ipAddress}, Got ${ipAddress}`);
      this.sessions.delete(token);
      return null;
    }

    // 最終アクセス時刻を更新
    session.lastAccessAt = now;
    return session;
  }

  // セッションの削除
  removeSession(token: string): void {
    this.sessions.delete(token);
  }

  // 特定社員のセッションを削除
  removeEmployeeSessions(employeeId: string): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.employeeId === employeeId) {
        this.sessions.delete(token);
      }
    }
  }

  // 期限切れセッションのクリーンアップ
  cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [token, session] of this.sessions.entries()) {
      const timeSinceLastAccess = now.getTime() - session.lastAccessAt.getTime();
      if (timeSinceLastAccess > this.SESSION_TIMEOUT_MS) {
        this.sessions.delete(token);
      }
    }
  }
}

// シングルトンインスタンス
export const sessionStore = new SessionStore();

// 定期的なクリーンアップ（1時間ごと）
setInterval(() => {
  sessionStore.cleanupExpiredSessions();
}, 60 * 60 * 1000);

// セッション認証ミドルウェア
export const sessionAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                req.cookies?.sessionToken;

  if (!token) {
    return res.status(401).json({
      error: '認証が必要です',
      message: 'セッショントークンが見つかりません'
    });
  }

  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                   req.socket.remoteAddress || '';

  const session = sessionStore.validateSession(token, clientIP);

  if (!session) {
    return res.status(401).json({
      error: 'セッションが無効です',
      message: 'セッションの有効期限が切れているか、無効なトークンです'
    });
  }

  // リクエストにセッション情報を追加
  (req as any).session = session;
  next();
};

// オプショナルなセッション認証（あればチェック、なくても通す）
export const optionalSessionAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                req.cookies?.sessionToken;

  if (token) {
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                     req.socket.remoteAddress || '';
    const session = sessionStore.validateSession(token, clientIP);
    if (session) {
      (req as any).session = session;
    }
  }

  next();
};