const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./db');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const pickupRoutes = require('./routes/pickupRoutes');
const collectorRoutes = require('./routes/collectorRoutes');
const activityRoutes = require('./routes/activityRoutes');
const reportRoutes = require('./routes/reportRoutes');
const residentRoutes = require('./routes/residentRoutes');
const adminManagementRoutes = require('./routes/adminManagementRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const truckRoutes = require('./routes/truckRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('AWC backend is running.');
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/collectors', collectorRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/resident', residentRoutes);
app.use('/api/admins', adminManagementRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/trucks', truckRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = Number(err?.statusCode || err?.status || 500);
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProduction) {
    return res.status(status).json({ message: status >= 500 ? 'Internal server error.' : String(err?.message || 'Request failed.') });
  }

  return res.status(status).json({
    message: String(err?.message || 'Internal server error.'),
    code: err?.code || null,
  });
});

const PORT = Number(process.env.PORT || 5000);

async function ensurePickupActualsColumns() {
  const databaseName = process.env.DB_NAME || 'awc_new';
  const requiredColumns = [
    {
      columnName: 'pickup_latitude',
      definition: 'DECIMAL(9,6) NULL AFTER pickup_address',
    },
    {
      columnName: 'pickup_longitude',
      definition: 'DECIMAL(9,6) NULL AFTER pickup_latitude',
    },
    {
      columnName: 'actual_weight_kg',
      definition: 'DECIMAL(6,2) NULL AFTER estimated_weight_kg',
    },
    {
      columnName: 'charged_amount',
      definition: 'DECIMAL(10,2) NULL AFTER actual_weight_kg',
    },
    {
      columnName: 'charge_currency',
      definition: 'CHAR(3) NULL AFTER charged_amount',
    },
  ];

  for (const item of requiredColumns) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'pickup_requests'
         AND COLUMN_NAME = ?`,
      [databaseName, item.columnName]
    );

    if (Number(rows[0]?.total || 0) === 0) {
      await pool.execute(
        `ALTER TABLE pickup_requests ADD COLUMN ${item.columnName} ${item.definition}`
      );
    }
  }
}

async function ensureTruckSpeedColumn() {
  const databaseName = process.env.DB_NAME || 'awc_new';

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'trucks'
       AND COLUMN_NAME = 'average_speed_kmh'`,
    [databaseName]
  );

  if (Number(rows[0]?.total || 0) === 0) {
    await pool.execute(
      'ALTER TABLE trucks ADD COLUMN average_speed_kmh DECIMAL(5,2) NOT NULL DEFAULT 28.00 AFTER capacity_kg'
    );
  }
}

async function ensurePasswordResetTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS password_reset_codes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      email VARCHAR(150) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_password_reset_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX idx_password_reset_email (email),
      INDEX idx_password_reset_user (user_id),
      INDEX idx_password_reset_expires (expires_at)
    )`
  );
}

async function validateSMTPConfiguration() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Check if SMTP is configured
  if (!host || !user || !pass) {
    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    console.warn('[WARN] Email service not configured. Missing: ' + missing.join(', '));
    console.warn('   Forgot-password feature will not work until SMTP credentials are added to .env');
    return false;
  }

  // Validate SMTP credentials with Brevo
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port || 587),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      auth: { user, pass },
      connectionTimeout: 5000,
      socketTimeout: 5000,
    });

    // Verify SMTP connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SMTP verification timeout'));
      }, 5000);

      transporter.verify((error, success) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(success);
      });
    });

    console.log('[SMTP] Configuration validated successfully');
    console.log('   Using Brevo SMTP: ' + host + ':' + port);
    return true;
  } catch (error) {
    console.warn('[WARN] SMTP validation failed: ' + error.message);
    console.warn('   Forgot-password emails will not be sent. Check SMTP credentials in .env');
    return false;
  }
}

async function startServer() {
  try {
    console.log('[DB] Preparing database schema...');
    await ensureTruckSpeedColumn();
    await ensurePickupActualsColumns();
    await ensurePasswordResetTable();

    console.log('[CONFIG] Validating email configuration...');
    await validateSMTPConfiguration();

    app.listen(PORT, () => {
      console.log('[SERVER] Listening on port ' + PORT);
      console.log('   API ready at http://localhost:' + PORT);
    });
  } catch (error) {
    console.error('[ERROR] Failed to prepare database schema at startup.', error);
    process.exit(1);
  }
}

startServer();
