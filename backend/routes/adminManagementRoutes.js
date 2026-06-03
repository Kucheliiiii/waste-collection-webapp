const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getAdmins,
  createAdmin,
  updateAdmin,
  setAdminStatus,
  resetAdminPassword,
  deleteAdmin,
} = require('../controllers/adminManagementController');

const router = express.Router();

// All admin management endpoints require admin or super_admin JWT
router.use(authenticate, requireRole('admin', 'super_admin'));

router.get('/', getAdmins);
router.post('/', createAdmin);
router.patch('/:adminUserId', updateAdmin);
router.patch('/:adminUserId/status', setAdminStatus);
router.patch('/:adminUserId/reset-password', resetAdminPassword);
router.delete('/:adminUserId', deleteAdmin);

module.exports = router;
