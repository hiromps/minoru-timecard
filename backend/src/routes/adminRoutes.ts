import express from 'express';
import { adminLogin, getAdminInfo } from '../controllers/adminController';
import { exportTimeRecords } from '../controllers/exportController';
import { adminAuth, ipRestriction } from '../middleware/auth';

const router = express.Router();

// Admin login (no IP restriction for development)
router.post('/login', adminLogin);

// Get admin info (authentication required)
router.get('/me', adminAuth, getAdminInfo);

// Excel export (admin auth + IP restriction)
router.get('/export/timerecords', ipRestriction, adminAuth, exportTimeRecords);

export default router;