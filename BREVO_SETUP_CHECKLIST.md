# 🚀 Brevo SMTP Setup Checklist

Complete this checklist to set up the forgot-password email feature.

---

## ✅ Part 1: Create Brevo Account

- [ ] Visit https://www.brevo.com
- [ ] Click "Sign Up Free" button
- [ ] Enter email, password, and company name
- [ ] Click "Create my account"
- [ ] Check inbox for verification email from Brevo
- [ ] Click verification link in email
- [ ] See "Account verified" confirmation

**Status:** ___________________

---

## ✅ Part 2: Generate SMTP Credentials

- [ ] Log in to https://app.brevo.com
- [ ] Click profile icon → select "Settings"
- [ ] Find "SMTP & API" or "Keys" section in left menu
- [ ] Click "SMTP" tab
- [ ] You should see:
  - [ ] SMTP Login / Access Key (copy this)
  - [ ] SMTP Key / Secret Key (copy this)
- [ ] Copy both values to a text file temporarily

**SMTP Login (Access Key):**
```
_________________________________
```

**SMTP Key (Secret Key):**
```
_________________________________
```

---

## ✅ Part 3: Verify Sender Email

- [ ] Go to Settings → Senders
- [ ] Click "Add a new sender"
- [ ] Enter your email address
- [ ] Check your inbox for verification from Brevo
- [ ] Click verification link
- [ ] Sender email is now verified

**Verified Sender Email:**
```
_________________________________
```

---

## ✅ Part 4: Update .env File

- [ ] Open `backend/.env` in your editor
- [ ] Find the SMTP section (lines with SMTP_*)
- [ ] Update these lines:

```env
SMTP_USER=<paste_your_access_key_here>
SMTP_PASS=<paste_your_secret_key_here>
SMTP_FROM=<paste_your_verified_sender_email>
```

**Example (with fake values):**
```env
SMTP_USER=user123@brevo.com
SMTP_PASS=xsmtp1234567890abcdef
SMTP_FROM=noreply@awc-waste.com
```

- [ ] Save the file (Ctrl+S)
- [ ] Don't commit this to git (keep credentials private)

**Confirmed:** ___________________

---

## ✅ Part 5: Test SMTP Connection

```bash
# Open terminal in the backend directory
cd backend

# Run the SMTP test
node test-smtp-connection.js
```

**Expected Output:**
```
========================================
  BREVO SMTP CONNECTION TESTER
========================================

[1/3] Checking SMTP configuration...
✓ Configuration found

[2/3] Creating SMTP transporter...

[3/3] Verifying SMTP connection...
✓ SMTP connection verified

========================================
  ✅ SMTP CONFIGURATION IS VALID
========================================
```

- [ ] Test passed ✅
- [ ] Test failed ❌ (go back to Part 2 and verify credentials)

**Test Result:** ___________________

---

## ✅ Part 6: Start Backend Server

```bash
# From backend directory
node server.js
```

**Expected Output:**
```
[DB] Preparing database schema...
[CONFIG] Validating email configuration...
[SMTP] Configuration validated successfully
   Using Brevo SMTP: smtp-relay.brevo.com:587
[SERVER] Listening on port 5000
   API ready at http://localhost:5000
```

- [ ] Server started successfully
- [ ] See `[SMTP] Configuration validated` message

**Backend Status:** ___________________

---

## ✅ Part 7: Test Forgot-Password Flow

### From Frontend:
1. [ ] Open your app login page
2. [ ] Click **"Forgot Password?"** link
3. [ ] Enter a registered resident email (must exist in database)
4. [ ] Click **"Request Reset Code"**
5. [ ] Go to your email inbox (check all folders)
6. [ ] Find email with subject: **"AWC Password Reset Code"**
7. [ ] Copy the **6-digit reset code** from email
8. [ ] Back on forgot-password modal, paste the code
9. [ ] Enter your **new password** (8+ characters)
10. [ ] Confirm the password
11. [ ] Click **"Reset Password"**
12. [ ] See success message: "Password reset successful"
13. [ ] Try to log in with your **new password** ✓

### If Email Doesn't Arrive:
- [ ] Wait 30 seconds (delivery takes time)
- [ ] Check spam/junk folder
- [ ] Check that email address is registered in database
- [ ] Check backend logs for `[SMTP]` error messages

**Frontend Test Result:** ___________________

---

## ✅ Part 8: Verify Backend Logs

When you requested the reset code, the backend should have logged:

```
[AUTH] Forgot-password request for: test@example.com
[AUTH] Found resident: John Doe (ID: 123)
[AUTH] Generated reset code for: test@example.com
[AUTH] Reset code stored in database (expires in 15 minutes)
[SMTP] Sending reset code to: test@example.com
[SMTP] Email sent successfully to: test@example.com (MessageID: ...)
```

- [ ] All logs present in terminal
- [ ] No SMTP errors shown

When you reset the password:

```
[AUTH] Reset password request for: test@example.com
[AUTH] Verifying reset code...
[AUTH] Reset code validated. Updating password for user ID: 123
[AUTH] Password updated and reset code marked as used
[AUTH] Password reset completed successfully for: test@example.com
```

- [ ] All logs present in terminal
- [ ] No authentication errors

**Logs Verified:** ___________________

---

## 🎉 Setup Complete!

Once all checkboxes are checked, your forgot-password feature is fully operational!

### What Residents Can Now Do:
✅ Click "Forgot Password?" on login  
✅ Receive secure reset code via email  
✅ Reset password with 6-digit code  
✅ Log in with new password  

### Security Features Enabled:
✅ 6-digit cryptographically secure codes  
✅ 15-minute code expiry  
✅ One-time use enforcement  
✅ SHA-256 hashing  
✅ Activity logging  
✅ Email validation  

---

## 📚 Documentation References

**Need help?** Check these guides:

- **Quick Visual Guide:** Open `BREVO_QUICK_START.md`
- **Full Reference:** Open `BREVO_SMTP_SETUP.md`
- **Setup Summary:** Open `SETUP_SUMMARY.md`
- **Troubleshooting:** See above guides → Troubleshooting section

---

## 🆘 Common Issues

| Problem | Solution |
|---------|----------|
| "Email service not configured" | SMTP_USER or SMTP_PASS is empty in .env |
| SMTP test fails with "Authentication failed" | Double-check credentials are copied exactly |
| Email not received | Check spam folder, wait 30 seconds, verify email exists |
| "Invalid or expired reset code" | Code expired after 15 min or doesn't match email |

---

## ✨ Final Steps

1. [ ] Print or save this checklist
2. [ ] Follow steps 1-8 in order
3. [ ] Check all boxes as you complete each step
4. [ ] Keep `.env` credentials secure (never commit to git)
5. [ ] Test with a few resident accounts
6. [ ] Deploy to production when confident

---

**Date Completed:** _______________  
**Completed By:** _______________  
**Notes:**  
```




```

Congratulations! Your password reset feature is ready! 🚀
