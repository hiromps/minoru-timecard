import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// 許可するIPアドレスの設定
const getAllowedIPs = (): string[] => {
  const configPath = path.join(__dirname, '../../config/allowed-ips.json');
  
  // 設定ファイルが存在する場合は読み込む
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.allowedIPs || [];
    } catch (error) {
      console.error('IPアドレス設定ファイルの読み込みエラー:', error);
    }
  }
  
  // デフォルトの許可IPアドレス（ローカル開発用）
  return [
    '127.0.0.1',
    '::1',
    'localhost',
    // 社内ネットワークのIPレンジを追加
    // 例: '192.168.1.0/24', '10.0.0.0/8'
  ];
};

// IPアドレスの正規化
const normalizeIP = (ip: string): string => {
  // IPv6のローカルアドレスを正規化
  if (ip === '::ffff:127.0.0.1' || ip === '::1') {
    return '127.0.0.1';
  }
  // IPv4マップされたIPv6アドレスから IPv4部分を抽出
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
};

// IPレンジのチェック
const isIPInRange = (ip: string, range: string): boolean => {
  // CIDR記法のサポート (例: 192.168.1.0/24)
  if (range.includes('/')) {
    const [rangeIP, maskBits] = range.split('/');
    const ipParts = ip.split('.').map(Number);
    const rangeParts = rangeIP.split('.').map(Number);
    const mask = parseInt(maskBits);
    
    if (ipParts.length !== 4 || rangeParts.length !== 4) {
      return false;
    }
    
    // IPアドレスを32ビット整数に変換
    const ipInt = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const rangeInt = (rangeParts[0] << 24) + (rangeParts[1] << 16) + (rangeParts[2] << 8) + rangeParts[3];
    
    // マスクを適用して比較
    const maskInt = (0xFFFFFFFF << (32 - mask)) >>> 0;
    return (ipInt & maskInt) === (rangeInt & maskInt);
  }
  
  // 完全一致
  return ip === range;
};

// IP制限ミドルウェア
export const ipRestriction = (req: Request, res: Response, next: NextFunction) => {
  // 環境変数でIP制限を無効化できる（開発環境用）
  if (process.env.DISABLE_IP_RESTRICTION === 'true') {
    return next();
  }
  
  // クライアントのIPアドレスを取得
  const clientIP = normalizeIP(
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    ''
  );
  
  const allowedIPs = getAllowedIPs();
  
  // IPアドレスが許可リストに含まれているかチェック
  const isAllowed = allowedIPs.some(allowedIP => isIPInRange(clientIP, allowedIP));
  
  if (!isAllowed) {
    console.log(`アクセス拒否: ${clientIP}`);
    return res.status(403).json({
      error: 'アクセスが拒否されました',
      message: '社内ネットワークからのみアクセス可能です',
      ip: process.env.NODE_ENV === 'development' ? clientIP : undefined
    });
  }
  
  next();
};

// 管理者専用エンドポイント用の強化IP制限
export const adminIPRestriction = (req: Request, res: Response, next: NextFunction) => {
  // 管理者アクセス用のより厳格なIPリスト
  const adminAllowedIPs = process.env.ADMIN_ALLOWED_IPS?.split(',') || [
    '127.0.0.1',
    '::1',
    // 管理者のPCのIPアドレスを追加
  ];
  
  const clientIP = normalizeIP(
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    ''
  );
  
  const isAllowed = adminAllowedIPs.some(allowedIP => isIPInRange(clientIP, allowedIP.trim()));
  
  if (!isAllowed) {
    console.log(`管理者アクセス拒否: ${clientIP}`);
    return res.status(403).json({
      error: 'アクセスが拒否されました',
      message: '管理者権限が必要です'
    });
  }
  
  next();
};