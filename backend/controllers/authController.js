const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'awc_new_secret_change_me';
const RESET_CODE_EXPIRY_MINUTES = Number(process.env.RESET_CODE_EXPIRY_MINUTES || 15);

let transporterPromise = null;

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getMailTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT || 587);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (!host || !user || !pass) {
        return null;
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
        auth: { user, pass },
        connectionTimeout: 5000,
        socketTimeout: 5000,
      });

      return transporter;
    })();
  }

  return transporterPromise;
}

async function sendPasswordResetEmail(toEmail, code, fullName) {
  const transporter = await getMailTransporter();
  if (!transporter) {
    const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
    const error = new Error(`Email service is not configured. Missing SMTP settings: ${missing.join(', ')}`);
    error.statusCode = 503;
    throw error;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const htmlContent = `<!DOCTYPE html><html><head><style>
body { font-family: Arial, sans-serif; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 4px; margin-bottom: 20px; }
.content { background-color: #f9f9f9; padding: 20px; border-radius: 4px; }
.code-box { background-color: #fff; border: 2px solid #4CAF50; padding: 15px; text-align: center; margin: 20px 0; border-radius: 4px; }
.code { font-size: 32px; font-weight: bold; color: #4CAF50; letter-spacing: 2px; }
.expiry { color: #d32f2f; font-weight: bold; }
.footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
</style></head><body><div class="container">
<div class="header"><h1>AWC Waste Collection</h1><p>Password Reset Request</p></div>
<div class="content">
<p>Hello ${fullName || 'Resident'},</p>
<p>We received a request to reset your password for your AWC account. Use the code below to reset your password:</p>
<div class="code-box"><div class="code">${code}</div></div>
<p><strong>Important:</strong> This code is <span class="expiry">valid for ${RESET_CODE_EXPIRY_MINUTES} minutes</span> only.</p>
<p><strong>To reset your password:</strong></p>
<ol><li>Go to the login page</li><li>Click "Forgot Password?"</li><li>Enter your email address</li><li>Paste the code above</li><li>Enter your new password</li></ol>
<p style="color: #d32f2f; font-weight: bold;">If you did not request this password reset, you can safely ignore this email. Your account is secure.</p>
</div><div class="footer"><p>This is an automated email from AWC Waste Collection System.</p><p>&copy; 2026 AWC. All rights reserved.</p></div>
</div></body></html>`;

  const mailOptions = {
    from,
    to: toEmail,
    subject: 'AWC Password Reset Code',
    html: htmlContent,
    text: `Hello ${fullName || 'Resident'},\n\nWe received a request to reset your password.\n\nYour password reset code is: ${code}\n\nThis code expires in ${RESET_CODE_EXPIRY_MINUTES} minutes.\n\nTo reset your password:\n1. Go to the login page\n2. Click "Forgot Password?"\n3. Enter your email address\n4. Paste the code: ${code}\n5. Enter your new password\n\nIf you did not request this, you can safely ignore this email.\n\nThis is an automated email from AWC Waste Collection System.`,
  };

  try {
    console.log('[SMTP] Sending reset code to: ' + toEmail);
    const info = await transporter.sendMail(mailOptions);
    console.log('[SMTP] Email sent successfully to: ' + toEmail + ' (MessageID: ' + info.messageId + ')');
  } catch (emailError) {
    console.error('[SMTP] Email delivery failed: ' + toEmail);
    console.error('[SMTP] Error: ' + emailError.message);
    const error = new Error(`Failed to send password reset email: ${emailError.message}`);
    error.statusCode = 503;
    throw error;
  }
}

async function ensurePasswordResetTable(conn) {
  await conn.execute(
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

async function register(req, res, next) {
  const { full_name, email, phone, password, address_line, zone_id } = req.body;

  if (!full_name || !email || !phone || !password || !zone_id || !address_line) {
    return res.status(400).json({ message: 'full_name, email, phone, password, address_line, and zone_id are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [zoneRows] = await conn.execute('SELECT id FROM zones WHERE id = ? AND is_active = 1', [zone_id]);
    if (zoneRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid zone_id.' });
    }

    const [existing] = await conn.execute('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email or phone already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await conn.execute(
      `INSERT INTO users (full_name, email, phone, password_hash, role, address_line, zone_id)
       VALUES (?, ?, ?, ?, 'resident', ?, ?)`,
      [full_name, email, phone, password_hash, address_line, zone_id]
    );

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'registration', ?, ?)`,
      [result.insertId, `New resident registered: ${email}`, req.ip || null]
    );

    await conn.commit();
    res.status(201).json({ message: 'Registration successful.', user_id: result.insertId });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function login(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, phone, role, zone_id, account_status, password_hash
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = rows[0];
    if (user.account_status !== 'active') {
      return res.status(403).json({ message: 'Account is not active.' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { user_id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log(`[AUTH] Login OK | id=${user.id} | role=${user.role} | email=${user.email}`);

    await pool.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'login', ?, ?)`,
      [user.id, `User logged in: ${user.email}`, req.ip || null]
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        zone_id: user.zone_id,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ message: 'email is required.' });
  }

  console.log('[AUTH] Forgot-password request for: ' + email);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensurePasswordResetTable(conn);

    const [rows] = await conn.execute(
      `SELECT id, full_name, email
       FROM users
       WHERE email = ?
         AND role = 'resident'
         AND account_status = 'active'
       LIMIT 1`,
      [email]
    );

    if (rows.length > 0) {
      const resident = rows[0];
      console.log('[AUTH] Found resident: ' + resident.full_name + ' (ID: ' + resident.id + ')');
      const code = generateResetCode();
      const codeHash = hashResetCode(code);

      console.log('[AUTH] Generated reset code for: ' + email);

      await conn.execute(
        `UPDATE password_reset_codes
         SET used_at = COALESCE(used_at, NOW())
         WHERE user_id = ?
           AND used_at IS NULL`,
        [resident.id]
      );

      await conn.execute(
        `INSERT INTO password_reset_codes (user_id, email, code_hash, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [resident.id, resident.email, codeHash, RESET_CODE_EXPIRY_MINUTES]
      );

      console.log('[AUTH] Reset code stored in database (expires in ' + RESET_CODE_EXPIRY_MINUTES + ' minutes)');
      await sendPasswordResetEmail(resident.email, code, resident.full_name);
    } else {
      console.log('[AUTH] No resident found for email: ' + email);
    }

    await conn.commit();
    res.json({ message: 'If this resident email exists, a password reset code has been sent.' });
  } catch (error) {
    await conn.rollback();
    console.error('[AUTH] Forgot-password error:', error.message);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  } finally {
    conn.release();
  }
}

async function resetPassword(req, res, next) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const resetCode = String(req.body?.reset_code || '').trim();
  const newPassword = String(req.body?.new_password || '');

  if (!email || !resetCode || !newPassword) {
    return res.status(400).json({ message: 'email, reset_code, and new_password are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  console.log('[AUTH] Reset password request for: ' + email);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensurePasswordResetTable(conn);

    const codeHash = hashResetCode(resetCode);
    console.log('[AUTH] Verifying reset code...');

    const [rows] = await conn.execute(
      `SELECT prc.id AS reset_id, u.id AS user_id, u.email
       FROM password_reset_codes prc
       JOIN users u ON u.id = prc.user_id
       WHERE prc.email = ?
         AND prc.code_hash = ?
         AND prc.used_at IS NULL
         AND prc.expires_at > NOW()
         AND u.role = 'resident'
         AND u.account_status = 'active'
       ORDER BY prc.id DESC
       LIMIT 1
       FOR UPDATE`,
      [email, codeHash]
    );

    if (rows.length === 0) {
      await conn.rollback();
      console.warn('[AUTH] Invalid/expired reset code for: ' + email);
      return res.status(400).json({ message: 'Invalid or expired reset code.' });
    }

    const record = rows[0];
    console.log('[AUTH] Reset code validated. Updating password for user ID: ' + record.user_id);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await conn.execute(
      `UPDATE users
       SET password_hash = ?
       WHERE id = ?`,
      [passwordHash, record.user_id]
    );

    await conn.execute(
      `UPDATE password_reset_codes
       SET used_at = NOW()
       WHERE id = ?`,
      [record.reset_id]
    );

    console.log('[AUTH] Password updated and reset code marked as used');

    await conn.execute(
      `INSERT INTO activity_logs (actor_user_id, activity_type, details, ip_address)
       VALUES (?, 'status_update', ?, ?)`,
      [record.user_id, `Resident password reset completed for ${record.email}.`, req.ip || null]
    );

    await conn.commit();
    console.log('[AUTH] Password reset completed successfully for: ' + email);
    res.json({ message: 'Password reset successful. You can now login with your new password.' });
  } catch (error) {
    await conn.rollback();
    console.error('[AUTH] Reset password error: ' + error.message);
    next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
};
