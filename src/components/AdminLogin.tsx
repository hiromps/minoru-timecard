import React, { useState, useEffect } from 'react';
import './AdminLogin.css';
import { simpleAuth } from '../lib/auth';

interface AdminLoginProps {
  onLogin: (user: any) => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // コンポーネント読み込み時に保存されたログイン情報を復元
  useEffect(() => {
    const savedUsername = localStorage.getItem('adminUsername');
    const savedPassword = localStorage.getItem('adminPassword');
    const savedRemember = localStorage.getItem('adminRemember') === 'true';
    
    if (savedRemember && savedUsername && savedPassword) {
      setUsername(savedUsername);
      setPassword(savedPassword);
      setRememberLogin(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await simpleAuth.authenticate(username, password);

      if (result.success) {
        // ログイン情報の記憶機能
        if (rememberLogin) {
          localStorage.setItem('adminUsername', username);
          localStorage.setItem('adminPassword', password);
          localStorage.setItem('adminRemember', 'true');
        } else {
          localStorage.removeItem('adminUsername');
          localStorage.removeItem('adminPassword');
          localStorage.removeItem('adminRemember');
        }

        // ローカルストレージにトークン保存（既存システムとの互換性のため）
        if ('token' in result && result.token) {
          localStorage.setItem('adminToken', result.token);
        }
        if ('user' in result) {
          onLogin(result.user);
        }
      } else {
        setError(result.error || 'ログインに失敗しました');
      }
    } catch (error) {
      setError('認証処理でエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-container">
        <h2>管理者ログイン</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">ユーザー名:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
              placeholder="ユーザー名を入力"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">パスワード:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="パスワードを入力"
              autoComplete="current-password"
            />
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
                disabled={loading}
              />
              <span className="checkbox-text">ログイン情報を記憶する</span>
            </label>
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" disabled={loading || !username || !password}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;