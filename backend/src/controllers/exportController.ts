import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';
import { db } from '../database/database';

// 打刻記録をExcel形式でエクスポート
export const exportTimeRecords = async (req: Request, res: Response) => {
  const { startDate, endDate, employeeId } = req.query;

  try {
    let query = `
      SELECT 
        tr.record_date,
        e.employee_id,
        e.name,
        e.department,
        tr.clock_in_time,
        tr.clock_out_time,
        tr.status,
        tr.work_hours
      FROM time_records tr
      JOIN employees e ON tr.employee_id = e.employee_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND tr.record_date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND tr.record_date <= ?';
      params.push(endDate);
    }
    
    if (employeeId) {
      query += ' AND tr.employee_id = ?';
      params.push(employeeId);
    }
    
    query += ' ORDER BY tr.record_date DESC, e.employee_id ASC';

    db.all(query, params, async (err, records: any[]) => {
      if (err) {
        return res.status(500).json({ error: 'データベースエラー' });
      }

      // Excelワークブックを作成
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('打刻記録');

      // ヘッダー行を設定
      worksheet.columns = [
        { header: '日付', key: 'record_date', width: 12 },
        { header: '社員ID', key: 'employee_id', width: 12 },
        { header: '氏名', key: 'name', width: 15 },
        { header: '部署', key: 'department', width: 15 },
        { header: '出勤時刻', key: 'clock_in_time', width: 12 },
        { header: '退勤時刻', key: 'clock_out_time', width: 12 },
        { header: 'ステータス', key: 'status', width: 10 },
        { header: '勤務時間', key: 'work_hours', width: 15 }
      ];

      // データ行を追加
      records.forEach(record => {
        // 時刻データを適切にフォーマット
        const formatTime = (timeString: string | null): string => {
          if (!timeString) return '';
          try {
            // ISO形式またはSQL DATETIME形式をパース
            const date = new Date(timeString);
            if (isNaN(date.getTime())) {
              // 別のフォーマットを試す
              const parseAttempt = new Date(timeString.replace(' ', 'T'));
              if (isNaN(parseAttempt.getTime())) {
                return timeString; // 無効な日付の場合は元の値を返す
              }
              return parseAttempt.toLocaleTimeString('ja-JP', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              });
            }
            return date.toLocaleTimeString('ja-JP', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            });
          } catch (error) {
            console.error('Time formatting error:', error);
            return timeString || '';
          }
        };

        // 勤務時間を「何時間何分」形式で計算してフォーマット
        const calculateWorkHours = (clockInTime: string | null, clockOutTime: string | null): string => {
          if (!clockInTime) return '0時間0分';
          if (!clockOutTime) return '-'; // 退勤していない場合
          
          try {
            const clockIn = new Date(clockInTime);
            const clockOut = new Date(clockOutTime);
            
            if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) {
              return '0時間0分';
            }
            
            const totalMinutes = Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / (1000 * 60)));
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            
            return `${hours}時間${minutes}分`;
          } catch (error) {
            console.error('Work hours calculation error:', error);
            return '0時間0分';
          }
        };

        // 日付をYYYY-MM-DD形式に統一
        const formatDate = (dateString: string): string => {
          if (!dateString) return '';
          // 既にYYYY-MM-DD形式の場合はそのまま返す
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return dateString;
          }
          // その他の形式をパース
          try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toISOString().split('T')[0];
          } catch (error) {
            return dateString;
          }
        };

        worksheet.addRow({
          record_date: formatDate(record.record_date),
          employee_id: record.employee_id,
          name: record.name,
          department: record.department || '',
          clock_in_time: formatTime(record.clock_in_time),
          clock_out_time: formatTime(record.clock_out_time),
          status: record.status || '通常',
          work_hours: calculateWorkHours(record.clock_in_time, record.clock_out_time)
        });
      });

      // ヘッダー行のスタイルを設定
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // データ行の書式設定
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          // 日付列の書式設定
          row.getCell(1).alignment = { horizontal: 'center' };
          // 社員ID列の書式設定
          row.getCell(2).alignment = { horizontal: 'center' };
          // 時刻列の書式設定
          row.getCell(5).alignment = { horizontal: 'center' };
          row.getCell(6).alignment = { horizontal: 'center' };
          // ステータス列の書式設定
          row.getCell(7).alignment = { horizontal: 'center' };
          // 勤務時間列の書式設定
          row.getCell(8).alignment = { horizontal: 'center' };
        }
      });

      // 罫線を追加
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // レスポンスヘッダーを設定
      const filename = `timecard_records_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Excelファイルをレスポンスに書き込み
      await workbook.xlsx.write(res);
      res.end();
    });
  } catch (error) {
    console.error('Excel出力エラー:', error);
    res.status(500).json({ error: 'Excel出力に失敗しました' });
  }
};

// 打刻記録をCSV形式でエクスポート
export const exportTimeRecordsCSV = async (req: Request, res: Response) => {
  const { startDate, endDate, employeeId } = req.query;

  try {
    let query = `
      SELECT 
        tr.record_date as '日付',
        e.employee_id as '社員ID',
        e.name as '氏名',
        e.department as '部署',
        tr.clock_in_time as '出勤時刻',
        tr.clock_out_time as '退勤時刻',
        tr.status as 'ステータス',
        tr.work_hours as '勤務時間'
      FROM time_records tr
      JOIN employees e ON tr.employee_id = e.employee_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND tr.record_date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND tr.record_date <= ?';
      params.push(endDate);
    }
    
    if (employeeId) {
      query += ' AND tr.employee_id = ?';
      params.push(employeeId);
    }
    
    query += ' ORDER BY tr.record_date DESC, e.employee_id ASC';

    db.all(query, params, (err, records: any[]) => {
      if (err) {
        return res.status(500).json({ error: 'データベースエラー' });
      }

      // 時刻データを適切にフォーマット
      const formatTime = (timeString: string | null): string => {
        if (!timeString) return '';
        try {
          const date = new Date(timeString);
          if (isNaN(date.getTime())) {
            const parseAttempt = new Date(timeString.replace(' ', 'T'));
            if (isNaN(parseAttempt.getTime())) return timeString;
            return parseAttempt.toLocaleTimeString('ja-JP', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            });
          }
          return date.toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
        } catch (error) {
          console.error('Time formatting error:', error);
          return timeString || '';
        }
      };

      // 勤務時間を「何時間何分」形式で計算
      const calculateWorkHours = (clockInTime: string | null, clockOutTime: string | null): string => {
        if (!clockInTime) return '0時間0分';
        if (!clockOutTime) return '-';
        
        try {
          const clockIn = new Date(clockInTime);
          const clockOut = new Date(clockOutTime);
          
          if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) {
            return '0時間0分';
          }
          
          const totalMinutes = Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / (1000 * 60)));
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          
          return `${hours}時間${minutes}分`;
        } catch (error) {
          return '0時間0分';
        }
      };

      // レコードの時刻データをフォーマット
      const formattedRecords = records.map(record => ({
        ...record,
        '出勤時刻': formatTime(record['出勤時刻']),
        '退勤時刻': formatTime(record['退勤時刻']),
        '勤務時間': calculateWorkHours(record['出勤時刻'], record['退勤時刻'])
      }));

      // CSV形式に変換
      const fields = ['日付', '社員ID', '氏名', '部署', '出勤時刻', '退勤時刻', 'ステータス', '勤務時間'];
      const json2csvParser = new Parser({ fields, withBOM: true });
      const csv = json2csvParser.parse(formattedRecords);

      // レスポンスヘッダーを設定
      const filename = `timecard_records_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // CSVデータを送信
      res.send(csv);
    });
  } catch (error) {
    console.error('CSV出力エラー:', error);
    res.status(500).json({ error: 'CSV出力に失敗しました' });
  }
};