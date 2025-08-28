import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import ipRangeCheck from 'ip-range-check';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 会社内IPアドレス範囲
const COMPANY_IP_RANGES = [
  '192.168.24.0/24',  // あなたの会社ネットワーク
  '127.0.0.1',        // ローカルホスト
  '::1',              // IPv6ローカルホスト
  '::ffff:127.0.0.1'  // IPv4マップされたIPv6ローカルホスト
];

interface AuthRequest extends Request {
  admin?: any;
}

// IPアドレス制限ミドルウェア
export const ipRestriction = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
  
  // 開発環境またはlocalhostの場合は制限を無効化
  if (process.env.NODE_ENV === 'development' || 
      clientIP === '127.0.0.1' || 
      clientIP === '::1' || 
      clientIP === '::ffff:127.0.0.1' ||
      req.hostname === 'localhost') {
    return next();
  }

  // clientIPがundefinedでないことを確認
  if (!clientIP) {
    return res.status(403).json({ 
      error: 'IPアドレスを取得できませんでした。' 
    });
  }

  const isAllowed = COMPANY_IP_RANGES.some(range => 
    ipRangeCheck(clientIP, range)
  );

  if (!isAllowed) {
    return res.status(403).json({ 
      error: 'アクセスが拒否されました。会社内ネットワークからアクセスしてください。' 
    });
  }

  next();
};

// 管理者認証ミドルウェア
export const adminAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: '認証トークンが必要です' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: '無効な認証トークンです' });
  }
};