// デモモード判定（環境変数に基づく）
const isDevMode = !process.env.REACT_APP_SUPABASE_URL || 
  process.env.REACT_APP_SUPABASE_URL.includes('placeholder') ||
  process.env.REACT_APP_SUPABASE_URL === 'your-project-url.supabase.co' ||
  !process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY === 'your-anon-key-here'

console.log('🔧 デモモード:', isDevMode ? 'ON' : 'OFF')
if (isDevMode) {
  console.log('📝 デモモードで動作中 - Supabaseは使用されません')
} else {
  console.log('🏭 本番モードで動作中 - Supabaseと連携します')
}

// Supabaseモッククライアント
const createMockSupabaseClient = () => {
  return {
    auth: {
      signInWithPassword: async () => ({ data: null, error: new Error('デモモード') }),
      signUp: async () => ({ data: null, error: new Error('デモモード') }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ 
        data: { subscription: null },
        unsubscribe: () => {}
      })
    },
    from: () => ({
      select: () => ({
        data: [],
        error: null,
        eq: () => ({ data: [], error: null }),
        order: () => ({ data: [], error: null }),
        single: () => ({ data: null, error: null })
      }),
      insert: () => ({
        data: null,
        error: new Error('デモモード'),
        select: () => ({
          single: () => ({ data: null, error: new Error('デモモード') })
        })
      }),
      update: () => ({
        data: null,
        error: new Error('デモモード'),
        eq: () => ({
          select: () => ({
            single: () => ({ data: null, error: new Error('デモモード') })
          })
        })
      }),
      delete: () => ({
        error: new Error('デモモード'),
        eq: () => ({ error: new Error('デモモード') })
      }),
      upsert: () => ({
        data: null,
        error: new Error('デモモード'),
        select: () => ({
          single: () => ({ data: null, error: new Error('デモモード') })
        })
      })
    })
  }
}

// Supabaseクライアント初期化（デモモードでは完全回避）
let supabase: any

if (isDevMode) {
  supabase = createMockSupabaseClient()
  console.log('🔧 Supabaseモッククライアント作成完了 - 実際のSupabaseは未初期化')
} else {
  // 本番環境でのみ実際のSupabaseクライアントを動的インポート
  try {
    const { createClient } = require('@supabase/supabase-js')
    
    // 環境変数から取得（フォールバック付き）
    let supabaseUrl = process.env.REACT_APP_SUPABASE_URL
    let supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
    
    // 環境変数が正しく読み込まれていない場合のフォールバック
    if (!supabaseUrl || supabaseUrl === 'your-project-url.supabase.co') {
      supabaseUrl = 'https://pddriyhmkvsklqmtxsro.supabase.co'
      console.log('⚠️ 環境変数のURLが無効なため、フォールバック値を使用')
    }
    
    if (!supabaseAnonKey || supabaseAnonKey === 'your-anon-key-here') {
      console.error('❌ 環境変数REACT_APP_SUPABASE_ANON_KEYが設定されていません')
      throw new Error('Supabase APIキーが設定されていません。.envファイルを確認してください。')
    }
    
    console.log('🔗 Supabase接続設定:', supabaseUrl)
    
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    console.log('✅ 実際のSupabaseクライアント作成完了')
  } catch (error) {
    console.error('❌ Supabaseクライアント作成エラー:', error)
    console.log('🔄 フォールバック: モッククライアントを使用')
    supabase = createMockSupabaseClient()
  }
}

export { supabase, isDevMode }

// 型定義
export interface Employee {
  id: number
  employee_id: string
  name: string
  department: string | null
  work_start_time: string
  work_end_time: string
  created_at: string
  updated_at: string
}

export interface TimeRecord {
  id: number
  employee_id: string
  record_date: string
  clock_in_time: string | null
  clock_out_time: string | null
  status: '通常' | '遅刻' | '早退' | '残業'
  work_hours: number
  created_at: string
  updated_at: string
}