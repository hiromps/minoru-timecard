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
      // 実APIと同じ形状（data.subscription.unsubscribe()）を返す。
      // subscription: null だと購読解除コードがデモモードで null 参照になる。
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } }
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
    
    // 環境変数から取得（ハードコードのフォールバックは持たない）
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
    const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

    // URL未設定/無効時は明確なエラーで停止（anonキーと同様の扱い）
    if (!supabaseUrl || supabaseUrl === 'your-project-url.supabase.co') {
      console.error('❌ 環境変数REACT_APP_SUPABASE_URLが設定されていません')
      throw new Error('Supabase URLが設定されていません。.envファイルを確認してください。')
    }

    if (!supabaseAnonKey || supabaseAnonKey === 'your-anon-key-here') {
      console.error('❌ 環境変数REACT_APP_SUPABASE_ANON_KEYが設定されていません')
      throw new Error('Supabase APIキーが設定されていません。.envファイルを確認してください。')
    }
    
    console.log('🔗 Supabase接続設定:', supabaseUrl)
    
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    console.log('✅ 実際のSupabaseクライアント作成完了')
  } catch (error) {
    // 本番モードでの初期化失敗をモックに黙ってフォールバックすると、
    // 設定ミスの本番ビルドが「空データで動いているように見える」ため危険。
    // 明示的に失敗させて起動時に気づけるようにする。
    console.error('❌ Supabaseクライアント作成エラー:', error)
    throw error
  }
}

export { supabase, isDevMode }

// 残業ルール区分:
// - standard: 通常（所定終業を過ぎた分がそのまま残業）
// - grace_15min: 特別猶予（所定終業後15分までは残業扱いにせず、16分目以降は猶予分を差し引いて計上）
// - hourly: アルバイト（残業代は計上しない。所定終業を大きく超えた場合のみ長時間勤務フラグを立てる）
// - executive: 役員（残業代は計上しない。長時間勤務フラグの記録も行わない）
export type OvertimeRuleType = 'standard' | 'grace_15min' | 'hourly' | 'executive'

// 型定義
export interface Employee {
  id: number
  employee_id: string
  name: string
  department: string | null
  work_start_time: string
  work_end_time: string
  /** 残業ルール区分。未設定（既存データ）は standard 扱い */
  overtime_rule_type?: OvertimeRuleType
  created_at: string
  updated_at: string
}

// ステータス型定義（複合ステータス対応）
export type TimeRecordStatus =
  | '通常'
  | '遅刻'
  | '早退'
  | '残業'
  | '遅刻・早退'
  | '遅刻・残業'
  | '設定エラー'
  | '欠勤'
  | '有給'

export interface TimeRecord {
  id: number
  employee_id: string
  record_date: string
  clock_in_time: string | null
  clock_out_time: string | null
  status: TimeRecordStatus
  work_hours: number
  overtime_minutes: number
  /** 直行・直帰モードで打刻された記録か。true なら遅刻/早退/残業判定を無効化。 */
  is_direct_work?: boolean
  /** アルバイト(hourly)が所定終業を大きく超えて勤務した場合の長時間勤務フラグ。残業代とは無関係。 */
  is_extended_hours?: boolean
  created_at: string
  updated_at: string
}