/**
 * Excelデータ検証スクリプト
 */
const XLSX = require('xlsx');
const path = require('path');

// Excelファイルを読み込み
const filePath = path.join(__dirname, '..', '..', '社員1-8_勤怠分析_個別退勤規則.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== シート一覧 ===');
console.log(workbook.SheetNames);

// 各シートの内容を表示
workbook.SheetNames.forEach(sheetName => {
    console.log(`\n=== ${sheetName} ===`);
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    data.forEach((row, i) => {
        console.log(`${i}: ${JSON.stringify(row)}`);
    });
});
