/**
 * 管理者ユーザー作成スクリプト
 * セキュリティのため、デフォルトアカウントは自動作成されません。
 * このスクリプトを使用して安全な管理者アカウントを作成してください。
 */

const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const readline = require('readline');

const dbPath = path.join(__dirname, 'backend/timecard.db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createAdminUser() {
  try {
    console.log('🔐 管理者アカウント作成');
    console.log('セキュリティのため、強力なパスワードを設定してください。\n');

    const username = await askQuestion('ユーザー名を入力してください: ');
    const password = await askQuestion('パスワードを入力してください: ');
    const name = await askQuestion('表示名を入力してください: ');

    if (!username || !password || !name) {
      console.log('❌ すべての項目を入力してください');
      rl.close();
      return;
    }

    if (password.length < 8) {
      console.log('❌ パスワードは8文字以上にしてください');
      rl.close();
      return;
    }

    // パスワードをハッシュ化
    const hashedPassword = bcrypt.hashSync(password, 12);

    // データベースに追加
    const db = new sqlite3.Database(dbPath);
    
    db.run(
      `INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)`,
      [username, hashedPassword, name],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            console.log('❌ そのユーザー名は既に使用されています');
          } else {
            console.log('❌ エラー:', err.message);
          }
        } else {
          console.log('✅ 管理者アカウントを作成しました');
          console.log(`📝 ユーザー名: ${username}`);
          console.log(`📝 表示名: ${name}`);
          console.log('\n🔒 パスワードは安全に保管してください');
        }
        
        db.close();
        rl.close();
      }
    );

  } catch (error) {
    console.log('❌ エラーが発生しました:', error.message);
    rl.close();
  }
}

// スクリプト実行
createAdminUser();