import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 管理者ログイン
export const adminLogin = (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードが必要です' });
  }

  db.get(
    'SELECT * FROM admins WHERE username = ?',
    [username],
    (err, admin: any) => {
      if (err) {
        return res.status(500).json({ error: 'データベースエラー' });
      }

      if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
        return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています' });
      }

      const token = jwt.sign(
        { id: admin.id, username: admin.username, name: admin.name },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        message: 'ログイン成功',
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          name: admin.name
        }
      });
    }
  );
};

// 管理者情報取得
export const getAdminInfo = (req: any, res: Response) => {
  res.json({
    admin: req.admin
  });
};