import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TimeClock from './components/TimeClock';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import { authService } from './lib/auth';
import './App.css';

// メインアプリケーションコンポーネント（打刻画面）
function MainApp() {
  console.log('🏠 メインアプリケーション（打刻画面）表示');
  return (
    <div className="App">
      <header className="app-header">
        <h1>ミノルタイムカードシステム</h1>
      </header>

      <main className="app-main">
        <TimeClock />
      </main>
    </div>
  );
}

// 管理者認証コンポーネント
function AdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [admin, setAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    console.log('🔍 管理者認証状態チェック開始');
    try {
      const currentUser = await authService.getCurrentUser();
      console.log('👤 現在のユーザー:', currentUser);
      if (currentUser) {
        setAdmin(currentUser.user);
        setIsAuthenticated(true);
        console.log('✅ 管理者認証済み');
      } else {
        console.log('❌ 認証なし - ログイン画面を表示');
      }
    } catch (error) {
      console.error('❗ 認証状態チェックエラー:', error);
    } finally {
      console.log('🏁 認証チェック完了 - loading: false');
      setLoading(false);
    }
  };

  const handleLogin = (user: any) => {
    setAdmin(user);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      localStorage.removeItem('adminToken'); // 既存システムとの互換性
      setAdmin(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('ログアウトエラー:', error);
      // エラーでも強制的にログアウト
      localStorage.removeItem('adminToken');
      setAdmin(null);
      setIsAuthenticated(false);
    }
  };

  if (loading) {
    return (
      <div className="App">
        <div className="loading" style={{ textAlign: 'center', padding: '50px' }}>
          <h2>管理者認証状態を確認中...</h2>
          <p>少々お待ちください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {isAuthenticated ? (
        <AdminDashboard admin={admin} onLogout={handleLogout} />
      ) : (
        <AdminLogin onLogin={handleLogin} />
      )}
    </div>
  );
}

// メインアプリケーションのルーティング
function App() {
  console.log('🚀 アプリケーション起動');
  
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminAuth />} />
      </Routes>
    </Router>
  );
}

export default App;