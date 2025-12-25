/**
 * Excelデータを使った残業判定ロジックの検証
 */
const XLSX = require('xlsx');
const path = require('path');

// 始業時刻（固定）
const START_TIME_MINUTES = 9 * 60; // 540分

// 社員別所定退勤時刻（分）
const EMPLOYEE_REGULAR_END_TIMES = {
    '大﨑 香奈子': 16 * 60,  // 960分
    '小齊平 千明': 15 * 60,  // 900分
};
const DEFAULT_REGULAR_END_MINUTES = 17 * 60; // 1020分

// 時刻文字列を分に変換
const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// 所定退勤時刻を取得
const getRegularEndMinutes = (employeeName) => {
    return EMPLOYEE_REGULAR_END_TIMES[employeeName] ?? DEFAULT_REGULAR_END_MINUTES;
};

// 勤怠計算
const calculateAttendance = (employeeName, clockIn, clockOut) => {
    const clockInMinutes = timeToMinutes(clockIn);
    const clockOutMinutes = timeToMinutes(clockOut);

    // 計算用出勤時刻 = max(実出勤時刻, 09:00)
    const workStartMinutes = Math.max(clockInMinutes, START_TIME_MINUTES);

    // 社員別所定退勤時刻
    const regularEndMinutes = getRegularEndMinutes(employeeName);

    // 実労働分 = 実退勤分 − 計算用出勤分
    const workMinutes = clockOutMinutes - workStartMinutes;

    // 残業分 = max(0, 実退勤分 − 社員別所定退勤分)
    const overtimeMinutes = Math.max(0, clockOutMinutes - regularEndMinutes);

    return {
        workStartMinutes,
        regularEndMinutes,
        workMinutes,
        overtimeMinutes,
    };
};

// Excelファイルを読み込み
const filePath = path.join(__dirname, '..', '..', '社員1-8_勤怠分析_個別退勤規則.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== 残業判定ロジック検証 ===\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

workbook.SheetNames.forEach(sheetName => {
    // シート名から社員名を抽出（例: "1_押川 新一" → "押川 新一"）
    const employeeName = sheetName.replace(/^\d+_/, '');

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`【${sheetName}】（所定退勤: ${getRegularEndMinutes(employeeName)}分）`);

    // ヘッダー行をスキップしてデータを処理
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 8) continue;

        const [date, clockIn, clockOut, expectedWorkStart, expectedRegularEnd, expectedWorkMinutes, , expectedOvertime] = row;

        if (!clockIn || !clockOut) continue;

        const result = calculateAttendance(employeeName, clockIn, clockOut);

        totalTests++;

        const checks = [
            { label: '計算用出勤分', actual: result.workStartMinutes, expected: expectedWorkStart },
            { label: '所定退勤分', actual: result.regularEndMinutes, expected: expectedRegularEnd },
            { label: '実労働分', actual: result.workMinutes, expected: expectedWorkMinutes },
            { label: '残業分', actual: result.overtimeMinutes, expected: expectedOvertime },
        ];

        const allPass = checks.every(c => c.actual === c.expected);

        if (allPass) {
            passedTests++;
            console.log(`  ✓ ${date} ${clockIn}~${clockOut} → 残業${result.overtimeMinutes}分`);
        } else {
            failedTests.push({ sheetName, date, clockIn, clockOut, checks });
            console.log(`  ✗ ${date} ${clockIn}~${clockOut}`);
            checks.forEach(c => {
                if (c.actual !== c.expected) {
                    console.log(`    - ${c.label}: 計算=${c.actual}, 期待=${c.expected}`);
                }
            });
        }
    }
    console.log('');
});

console.log('=== 検証結果サマリー ===');
console.log(`総テスト数: ${totalTests}`);
console.log(`成功: ${passedTests}`);
console.log(`失敗: ${failedTests.length}`);

if (failedTests.length === 0) {
    console.log('\n✅ すべてのテストが成功しました！');
} else {
    console.log('\n❌ 失敗したテストケース:');
    failedTests.forEach(f => {
        console.log(`  - ${f.sheetName} ${f.date}`);
    });
}
