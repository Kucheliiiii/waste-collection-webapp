# Forgot-Password Feature - Setup Instructions

Your AWC application now has a complete forgot-password system with Brevo SMTP integration.

## 📋 What's Been Set Up

✅ **Backend Email System**
- Forgot-password endpoint: `POST /api/auth/forgot-password`
- Reset password endpoint: `POST /api/auth/reset-password`
- Secure 6-digit reset codes with SHA-256 hashing
- 15-minute code expiry with one-time use enforcement
- Production-ready error handling and logging

✅ **Frontend Password Reset UI**
- Login page with "Forgot Password?" link
- 2-step modal flow (request code → reset password)
- Form validation and error messages
- Success/error notifications

✅ **Database Schema**
- `password_reset_codes` table with proper indexing
- User-password relationship with CASCADE delete
- Activity logging for security audit trail

✅ **SMTP Configuration**
- Nodemailer transporter with timeout support (5s)
- Brevo SMTP integration (smtp-relay.brevo.com:587)
- Server startup validation with clear logging
- SMTP connection test utility

---

## 🎯 What You Need to Do (5 Steps)

### 1. Create Brevo Account & Get SMTP Credentials
   - Go to: https://www.brevo.com/
   - Sign up for free → Verify email
   - Go to Settings → SMTP & API → SMTP
   - Copy: **SMTP Login** (access key) and **SMTP Key** (secret key)

### 2. Verify Sender Email in Brevo
   - Go to: Settings → Senders
   - Add a sender email (must be verified)
   - This is what will appear as the sender in password reset emails

### 3. Update backend/.env
   Open `backend/.env` and fill in:
   ```env
   SMTP_USER=<your_brevo_access_key>
   SMTP_PASS=<your_brevo_secret_key>
   SMTP_FROM=<verified_sender_email>
   ```

### 4. Test SMTP Connection
   ```bash
   cd backend
   node test-smtp-connection.js
   ```
   Should show: ✅ SMTP CONFIGURATION IS VALID

### 5. Restart Backend & Test
   ```bash
   # Terminal 1: Start backend
   cd backend
   node server.js
   
   # Terminal 2: Test the feature
   # Open app → Login → "Forgot Password?" → Enter email
   # Check inbox for reset code → Reset password
   ```

---

## 📖 Detailed Guides

**For step-by-step visual guide:**
→ Open `BREVO_QUICK_START.md`

**For comprehensive reference:**
→ Open `BREVO_SMTP_SETUP.md`

---

## 🧪 Testing Checklist

Use these test cases to verify everything works:

### Test 1: SMTP Connection
```bash
cd backend
node test-smtp-connection.js
```
✓ Should say "SMTP CONFIGURATION IS VALID"

### Test 2: Backend Startup
```bash
cd backend
node server.js
```
✓ Should show "[SMTP] Configuration validated successfully"

### Test 3: Forgot-Password Flow (Frontend)
1. Open login page
2. Click "Forgot Password?"
3. Enter registered resident email (e.g., amina.bello@gmail.com)
4. Check email inbox (5-30 seconds)
5. Copy 6-digit reset code
6. Enter code + new password + confirm
7. Should see "Password reset successful"
8. Login with new password ✓

### Test 4: Forgot-Password API (cURL)
```bash
# Request reset code
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Reset with code
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "reset_code":"123456",
    "new_password":"NewPass123"
  }'
```
✓ Should show success messages

---

## 📂 Related Files

**Configuration:**
- `backend/.env` - SMTP credentials go here
- `backend/server.js` - SMTP validation at startup
- `backend/controllers/authController.js` - Email sending logic

**Testing:**
- `backend/test-smtp-connection.js` - SMTP tester utility

**Frontend:**
- `src/components/Login.jsx` - Forgot-password modal
- `src/services/apiService.js` - API calls (forgotPassword, resetPassword)

**Documentation:**
- `BREVO_QUICK_START.md` - Step-by-step visual guide
- `BREVO_SMTP_SETUP.md` - Comprehensive reference

---

## ⚙️ Configuration Reference

```env
# Fixed Brevo SMTP Server
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false

# Your Brevo Credentials (get from Brevo dashboard)
SMTP_USER=<brevo_access_key>
SMTP_PASS=<brevo_secret_key>

# Verified sender email (must be verified in Brevo)
SMTP_FROM=<your_verified_email>

# Optional: Reset code expiry (default 15 minutes)
RESET_CODE_EXPIRY_MINUTES=15
```

---

## 🔒 Security Features

- ✅ 6-digit cryptographically secure random codes
- ✅ SHA-256 hashing before database storage
- ✅ Automatic expiry after 15 minutes
- ✅ One-time use enforcement
- ✅ Email validation (only active residents)
- ✅ Activity logging for audit trail
- ✅ Password hashing with bcrypt (10 rounds)
- ✅ SQL injection protection (parameterized queries)

---

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| "Email service not configured" | SMTP_USER or SMTP_PASS is empty in .env |
| "Authentication failed" | SMTP credentials are incorrect - regenerate in Brevo |
| Email not received | Check spam folder, wait 5-30s, verify recipient email exists |
| "Invalid or expired reset code" | Code expired (15 min) or doesn't match - request new code |
| Server won't start | Check .env syntax, ensure database connection works |

---

## 📞 Support

**Brevo Resources:**
- Sign up: https://www.brevo.com
- Dashboard: https://app.brevo.com
- API Docs: https://developers.brevo.com
- SMTP Guide: https://developers.brevo.com/docs/how-to-configure-smtp

**Code Issues:**
- Check `BREVO_QUICK_START.md` → Troubleshooting section
- Review server logs: `node server.js` output
- Run test utility: `node backend/test-smtp-connection.js`

---

## ✅ Quick Start

```bash
# Step 1: Update credentials in backend/.env
# (Get from Brevo Settings → SMTP & API)

# Step 2: Test SMTP connection
cd backend
node test-smtp-connection.js

# Step 3: Start backend
node server.js

# Step 4: Test from login page
# Click "Forgot Password?" and follow the flow
```

That's it! The forgot-password feature is ready to use.
