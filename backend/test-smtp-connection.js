#!/usr/bin/env node
/**
 * Brevo SMTP Configuration Tester
 * 
 * This script tests your Brevo SMTP credentials without needing to send a real email.
 * Run this AFTER you've configured .env with your Brevo credentials.
 * 
 * Usage:
 *   node test-smtp-connection.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

console.log('\n========================================');
console.log('  BREVO SMTP CONNECTION TESTER');
console.log('========================================\n');

// Step 1: Check if credentials exist
console.log('[1/3] Checking SMTP configuration...');
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  const missing = [];
  if (!SMTP_HOST) missing.push('SMTP_HOST');
  if (!SMTP_USER) missing.push('SMTP_USER');
  if (!SMTP_PASS) missing.push('SMTP_PASS');
  console.error('\n❌ SMTP Configuration Incomplete');
  console.error('   Missing: ' + missing.join(', '));
  console.error('\n   Please add these to backend/.env:');
  console.error('   SMTP_HOST=smtp-relay.brevo.com');
  console.error('   SMTP_PORT=587');
  console.error('   SMTP_USER=<your_brevo_access_key>');
  console.error('   SMTP_PASS=<your_brevo_secret_key>');
  console.error('   SMTP_SECURE=false');
  console.error('   SMTP_FROM=<verified_sender_email>');
  process.exit(1);
}

console.log('✓ Configuration found');
console.log('  Host: ' + SMTP_HOST);
console.log('  Port: ' + SMTP_PORT);
console.log('  User: ' + SMTP_USER.substring(0, 8) + '...' + (SMTP_USER.length > 8 ? SMTP_USER.substring(SMTP_USER.length - 4) : ''));
console.log('  Secure: ' + SMTP_SECURE);

// Step 2: Create transporter
console.log('\n[2/3] Creating SMTP transporter...');
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  connectionTimeout: 5000,
  socketTimeout: 5000,
});

// Step 3: Verify connection
console.log('[3/3] Verifying SMTP connection...');
transporter.verify((error, success) => {
  if (error) {
    console.error('\n❌ SMTP Connection Failed');
    console.error('   Error: ' + error.message);
    console.error('\n   Possible solutions:');
    console.error('   1. Verify SMTP_USER and SMTP_PASS are correct (copy from Brevo dashboard)');
    console.error('   2. Check that your Brevo account email is verified');
    console.error('   3. Ensure firewall allows port 587 outbound');
    console.error('   4. Try refreshing your SMTP key in Brevo Settings\n');
    process.exit(1);
  }

  console.log('✓ SMTP connection verified');
  console.log('\n========================================');
  console.log('  ✅ SMTP CONFIGURATION IS VALID');
  console.log('========================================');
  console.log('\nYou can now use the forgot-password feature!');
  console.log('Test it by:');
  console.log('  1. Opening the login page');
  console.log('  2. Clicking "Forgot Password?"');
  console.log('  3. Entering a registered resident email');
  console.log('  4. Checking the email inbox for reset code\n');
  process.exit(0);
});
