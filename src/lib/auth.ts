import { supabase } from './supabase'
import { isDevMode } from './mockData'

// 管理者認証関連の関数
export const authService = {
  // 管理者ログイン（メール・パスワード）
  async adminSignIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }

    // 管理者プロファイルが存在するかチェック
    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile?.is_active) {
        await supabase.auth.signOut()
        throw new Error('管理者アカウントが見つからないか、無効化されています')
      }

      return {
        user: data.user,
        profile,
        session: data.session
      }
    }

    throw new Error('ログインに失敗しました')
  },

  // 管理者サインアップ（初回設定用）
  async adminSignUp(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name
        }
      }
    })

    if (error) {
      throw error
    }

    if (data.user) {
      // 管理者プロファイル作成
      const { error: profileError } = await supabase
        .from('admin_profiles')
        .insert({
          id: data.user.id,
          name: name,
          is_active: true
        })

      if (profileError) {
        throw profileError
      }
    }

    return data
  },

  // ログアウト
  async signOut() {
    if (isDevMode) {
      localStorage.removeItem('adminToken')
      return
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
  },

  // 現在のユーザー情報取得
  async getCurrentUser() {
    console.log('🔍 getCurrentUser実行開始 - isDevMode:', isDevMode)
    
    if (isDevMode) {
      // デモモードでは既存のトークンをチェック
      const token = localStorage.getItem('adminToken')
      console.log('🔧 デモモード - トークン確認:', token)
      
      if (token === 'demo-token') {
        console.log('✅ デモモード認証成功')
        return {
          user: { id: 'demo-admin', email: 'admin@demo.local' },
          profile: { id: 'demo-admin', name: '管理者', is_active: true }
        }
      }
      console.log('❌ デモモード - 無効なトークンまたはトークンなし')
      return null
    }

    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return null
    }

    // 管理者プロファイル取得
    const { data: profile, error } = await supabase
      .from('admin_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error || !profile?.is_active) {
      return null
    }

    return {
      user,
      profile
    }
  },

  // セッション監視
  onAuthStateChange(callback: (user: any) => void) {
    return supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      if (session?.user) {
        // 管理者プロファイルチェック
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profile?.is_active) {
          callback({ user: session.user, profile })
        } else {
          callback(null)
        }
      } else {
        callback(null)
      }
    })
  }
}

// 簡易認証（従来システム互換）
export const simpleAuth = {
  // ユーザー名・パスワード認証
  async authenticate(username: string, password: string) {
    // デモモードでは簡易認証（認証情報は環境変数化・個人名を排除）
    if (isDevMode) {
      // デモ用の管理者ログイン情報（デモ専用・本番では使用不可）
      const DEMO_USER = process.env.REACT_APP_DEMO_ADMIN_USER || 'admin'
      const DEMO_PASS = process.env.REACT_APP_DEMO_ADMIN_PASS || 'minoru-demo'

      if (username === DEMO_USER && password === DEMO_PASS) {
        console.log('🔧 デモモード: 管理者認証成功')
        return {
          success: true,
          user: { id: 'demo-admin', email: 'admin@demo.local', name: '管理者(デモ)' },
          token: 'demo-token'
        }
      } else {
        return {
          success: false,
          error: 'ユーザー名またはパスワードが正しくありません'
        }
      }
    }

    // ユーザー名による認証チェック（個人名依存を排除）
    // 本番認証は固定メール admin@timecard.local に対するパスワード認証で行うため、
    // ユーザー名は表示用に過ぎない。後方互換で特定ユーザー名に限定したい場合のみ
    // 環境変数 REACT_APP_ADMIN_USERNAME を設定する（未設定なら任意のユーザー名を受理）。
    const allowedUsername = process.env.REACT_APP_ADMIN_USERNAME
    if (allowedUsername && username !== allowedUsername) {
      return {
        success: false,
        error: 'ユーザー名またはパスワードが正しくありません'
      }
    }

    // 簡易認証用の固定メールアドレス
    const adminEmail = 'admin@timecard.local'
    
    try {
      // まず既存のセッションをクリア
      await supabase.auth.signOut()
      
      // 固定アカウントでログイン試行
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: password
      })

      if (error) {
        // アカウントが存在しない場合は作成
        if (error.message.includes('Invalid login credentials')) {
          return await this.createSimpleAdmin(password)
        }
        throw error
      }

      return {
        success: true,
        user: data.user,
        token: data.session?.access_token
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'ログインに失敗しました'
      }
    }
  },

  // 簡易管理者アカウント作成
  async createSimpleAdmin(password: string) {
    const adminEmail = 'admin@timecard.local'
    const adminName = '管理者'

    try {
      const { data, error } = await supabase.auth.signUp({
        email: adminEmail,
        password: password,
        options: {
          emailRedirectTo: undefined // メール確認を無効化
        }
      })

      if (error) {
        throw error
      }

      if (data.user) {
        // 管理者プロファイル作成
        await supabase
          .from('admin_profiles')
          .insert({
            id: data.user.id,
            name: adminName,
            is_active: true
          })

        // 即座にログイン
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password: password
        })

        return {
          success: true,
          user: signInData?.user,
          token: signInData?.session?.access_token
        }
      }

      throw new Error('アカウント作成に失敗しました')
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'アカウント作成に失敗しました'
      }
    }
  }
}