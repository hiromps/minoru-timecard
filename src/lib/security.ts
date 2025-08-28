// セキュリティ強化用のユーティリティ関数
import { supabase, isDevMode } from './supabase'

// 強化された型定義
export interface EnhancedAdminProfile {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'admin' | 'viewer'
  is_active: boolean
  last_login?: string
  failed_login_attempts: number
  locked_until?: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: number
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT'
  old_values?: any
  new_values?: any
  user_id?: string
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface UserSession {
  id: string
  user_id: string
  ip_address: string
  user_agent?: string
  is_active: boolean
  expires_at: string
  created_at: string
  last_activity: string
}

// セキュリティ設定
export const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 60 * 60 * 1000, // 1時間（ミリ秒）
  SESSION_DURATION: 8 * 60 * 60 * 1000, // 8時間（ミリ秒）
  ALLOWED_IPS: process.env.REACT_APP_ALLOWED_IPS?.split(',') || [],
  AUDIT_LOG_RETENTION_DAYS: 180, // 6ヶ月
}

// デモモードのモック関数
const mockSecurityFunctions = {
  getCurrentUserRole: async (): Promise<EnhancedAdminProfile | null> => {
    console.log('🔧 [デモ] 管理者権限チェック')
    return {
      id: 'demo-admin-id',
      name: 'デモ管理者',
      email: 'demo@example.com',
      role: 'super_admin',
      is_active: true,
      failed_login_attempts: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  },
  hasPermission: (userRole: string | null, requiredRole: string): boolean => {
    console.log(`🔧 [デモ] 権限チェック: ${userRole} >= ${requiredRole}`)
    return true
  },
  createUserSession: async (): Promise<boolean> => {
    console.log('🔧 [デモ] セッション作成')
    return true
  },
  handleFailedLogin: async (email: string): Promise<void> => {
    console.log(`🔧 [デモ] 失敗ログイン処理: ${email}`)
  },
  getAuditLogs: async (limit = 100): Promise<AuditLog[]> => {
    console.log(`🔧 [デモ] 監査ログ取得 (${limit}件)`)
    return []
  },
  cleanupExpiredSessions: async (): Promise<void> => {
    console.log('🔧 [デモ] セッションクリーンアップ')
  },
  checkIPAllowed: (ip: string): boolean => {
    console.log(`🔧 [デモ] IP許可チェック: ${ip}`)
    return true
  },
  logSecurityEvent: async (event: string, details: any): Promise<void> => {
    console.log(`🔧 [デモ] セキュリティイベント: ${event}`, details)
  }
}

// 実際のSupabase関数
const supabaseSecurityFunctions = {
  // 現在のユーザーの権限を取得
  getCurrentUserRole: async (): Promise<EnhancedAdminProfile | null> => {
    if (!supabase) return null
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', user.id)
        .eq('is_active', true)
        .single()

      if (error) {
        console.error('権限取得エラー:', error)
        return null
      }

      // ロック状態をチェック
      if (data.locked_until && new Date(data.locked_until) > new Date()) {
        console.warn('アカウントがロックされています')
        return null
      }

      return data
    } catch (error) {
      console.error('権限チェックエラー:', error)
      return null
    }
  },

  // 権限チェック関数
  hasPermission: (userRole: string | null, requiredRole: string): boolean => {
    if (!userRole) return false
    
    const roleHierarchy = {
      'super_admin': 3,
      'admin': 2, 
      'viewer': 1
    }
    
    const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
    const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0
    
    return userLevel >= requiredLevel
  },

  // セッション管理
  createUserSession: async (): Promise<boolean> => {
    if (!supabase) return false
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      // 既存のセッションを無効化
      await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('user_id', user.id)

      // 新しいセッションを作成
      const { error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          ip_address: await getClientIP(),
          user_agent: navigator.userAgent,
          expires_at: new Date(Date.now() + SECURITY_CONFIG.SESSION_DURATION).toISOString()
        })

      return !error
    } catch (error) {
      console.error('セッション作成エラー:', error)
      return false
    }
  },

  // 失敗ログイン処理
  handleFailedLogin: async (email: string): Promise<void> => {
    if (!supabase) return

    try {
      // Supabase関数を呼び出し
      await supabase.rpc('handle_failed_login', { user_email: email })
    } catch (error) {
      console.error('失敗ログイン処理エラー:', error)
    }
  },

  // 監査ログの取得
  getAuditLogs: async (limit = 100): Promise<AuditLog[]> => {
    if (!supabase) return []
    
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('監査ログ取得エラー:', error)
      return []
    }
  },

  // セッションクリーンアップ
  cleanupExpiredSessions: async (): Promise<void> => {
    if (!supabase) return
    
    try {
      await supabase.rpc('cleanup_expired_sessions')
    } catch (error) {
      console.error('セッションクリーンアップエラー:', error)
    }
  },

  // IP許可チェック
  checkIPAllowed: async (ip: string): Promise<boolean> => {
    if (SECURITY_CONFIG.ALLOWED_IPS.length === 0) return true
    
    // 簡易的なIP範囲チェック（実際の実装では適切なライブラリを使用）
    return SECURITY_CONFIG.ALLOWED_IPS.some(allowedIP => {
      if (allowedIP.includes('/')) {
        // CIDR記法の場合（簡易チェック）
        const baseIP = allowedIP.split('/')[0]
        return ip.startsWith(baseIP.substring(0, baseIP.lastIndexOf('.')))
      } else {
        return ip === allowedIP
      }
    })
  },

  // セキュリティイベントのログ記録
  logSecurityEvent: async (event: string, details: any): Promise<void> => {
    if (!supabase) return
    
    try {
      await supabase
        .from('audit_logs')
        .insert({
          table_name: 'security_events',
          record_id: 'system',
          action: 'INSERT',
          new_values: { event, details, timestamp: new Date().toISOString() },
          ip_address: await getClientIP(),
          user_agent: navigator.userAgent
        })
    } catch (error) {
      console.error('セキュリティイベントログエラー:', error)
    }
  }
}

// IP アドレス取得（簡易版）
const getClientIP = async (): Promise<string> => {
  try {
    // 実際の実装では適切なIPアドレス取得サービスを使用
    // 例: const response = await fetch('https://api.ipify.org?format=json')
    // const data = await response.json()
    // return data.ip
    return '0.0.0.0' 
  } catch {
    return '0.0.0.0'
  }
}

// デモモードかどうかに応じて適切な関数を返す
export const {
  getCurrentUserRole,
  hasPermission,
  createUserSession,
  handleFailedLogin,
  getAuditLogs,
  cleanupExpiredSessions,
  checkIPAllowed,
  logSecurityEvent
} = isDevMode ? mockSecurityFunctions : supabaseSecurityFunctions

// セキュリティミドルウェア
export class SecurityMiddleware {
  private static instance: SecurityMiddleware
  private userRole: string | null = null
  private lastRoleCheck: number = 0
  private readonly ROLE_CACHE_DURATION = 5 * 60 * 1000 // 5分

  static getInstance(): SecurityMiddleware {
    if (!SecurityMiddleware.instance) {
      SecurityMiddleware.instance = new SecurityMiddleware()
    }
    return SecurityMiddleware.instance
  }

  // キャッシュ付き権限チェック
  async checkPermission(requiredRole: string): Promise<boolean> {
    const now = Date.now()
    
    // キャッシュが有効期限内の場合
    if (this.userRole && (now - this.lastRoleCheck) < this.ROLE_CACHE_DURATION) {
      return hasPermission(this.userRole, requiredRole)
    }

    // 権限を再取得
    const profile = await getCurrentUserRole()
    this.userRole = profile?.role || null
    this.lastRoleCheck = now

    return hasPermission(this.userRole, requiredRole)
  }

  // キャッシュクリア
  clearRoleCache(): void {
    this.userRole = null
    this.lastRoleCheck = 0
  }

  // セキュリティガード
  async requirePermission(requiredRole: string): Promise<void> {
    const hasAccess = await this.checkPermission(requiredRole)
    if (!hasAccess) {
      await logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', {
        requiredRole,
        currentRole: this.userRole,
        url: window.location.href
      })
      throw new Error(`権限が不足しています。必要な権限: ${requiredRole}`)
    }
  }
}

// 便利な権限チェックフック用の関数
export const requirePermission = async (requiredRole: string): Promise<void> => {
  const middleware = SecurityMiddleware.getInstance()
  await middleware.requirePermission(requiredRole)
}

// セキュリティ状態の初期化
export const initializeSecurity = async (): Promise<void> => {
  try {
    if (!isDevMode) {
      // セッションクリーンアップ
      await cleanupExpiredSessions()
      
      // セキュリティイベントログ
      await logSecurityEvent('SYSTEM_STARTUP', {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      })
      
      console.log('✅ セキュリティシステム初期化完了')
    } else {
      console.log('🔧 [デモ] セキュリティシステム初期化（モック）')
    }
  } catch (error) {
    console.error('❌ セキュリティシステム初期化エラー:', error)
  }
}

// 定期実行用のセキュリティメンテナンス
export const performSecurityMaintenance = async (): Promise<void> => {
  try {
    await cleanupExpiredSessions()
    console.log('✅ セキュリティメンテナンス完了')
  } catch (error) {
    console.error('❌ セキュリティメンテナンスエラー:', error)
  }
}

// エクスポート用のデフォルト設定
export default {
  SECURITY_CONFIG,
  getCurrentUserRole,
  hasPermission,
  createUserSession,
  handleFailedLogin,
  getAuditLogs,
  cleanupExpiredSessions,
  checkIPAllowed,
  logSecurityEvent,
  SecurityMiddleware,
  requirePermission,
  initializeSecurity,
  performSecurityMaintenance
}