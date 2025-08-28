import express from 'express';
import { clockIn, clockOut, getTimeRecords, getTimeRecordsForExport, getEmployeeTimeRecords, getTodayRecord } from '../controllers/timeRecordController';
import { exportTimeRecords, exportTimeRecordsCSV } from '../controllers/exportController';

const router = express.Router();

router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.get('/', getTimeRecords);
router.get('/export', getTimeRecordsForExport);
router.get('/export/excel', exportTimeRecords);
router.get('/export/csv', exportTimeRecordsCSV);
router.get('/employee/:employee_id', getEmployeeTimeRecords);
router.get('/today/:employee_id', getTodayRecord);

export default router;