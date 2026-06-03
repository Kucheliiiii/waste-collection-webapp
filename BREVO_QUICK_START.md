# 🚀 Brevo SMTP Setup - Step-by-Step Guide

Follow this guide to set up Brevo SMTP for the forgot-password email feature.

---

## Step 1: Create a Free Brevo Account

1. **Open your browser** and go to:
   ```
   https://www.brevo.com/
   ```

2. **Click "Sign Up Free"** button in the top-right corner

3. **Fill in the registration form:**
   - Email: your email address
   - Password: create a strong password (8+ characters)
   - First Name: your name
   - Company Name: AWC or your organization

4. **Agree to terms** and click **"Create my account"**

5. **Verify your email:**
   - Check your inbox for email from Brevo
   - Click the verification link
   - You should see "Account verified" confirmation

6. **You're in!** You'll be redirected to the Brevo dashboard

---

## Step 2: Generate SMTP Credentials

### Option A: From Settings (Recommended)

1. **Log in to Brevo** (https://app.brevo.com)

2. **Click your profile icon** in the top-right corner

3. **Select "Settings"** from dropdown

4. **Find "SMTP & API"** or **"Keys"** section in the left menu

5. **Click on the "SMTP" tab** (or "Create SMTP key" button)

6. **You'll see:**
   ```
   SMTP Server:     smtp-relay.brevo.com
   Port (TLS):      587
   Port (SSL):      465
   SMTP Login:      (copy this - it's your ACCESS KEY)
   SMTP Key:        (copy this - it's your SECRET KEY)
   ```

7. **Copy both values** to a safe place (text file, notes app, etc.)

### Option B: Using API Section

1. Go to **Settings** → **API & Keys** → **SMTP keys**
2. Click **"Create a new SMTP key"**
3. Name it: `AWC Backend`
4. Copy the generated access key and secret key

---

## Step 3: Verify Sender Email

Before emails can be sent, Brevo needs to know which email address will be the sender.

### For Free Plan:
1. In Brevo dashboard, go to **Settings** → **Senders**
2. Click **"Add a new sender"**
3. Enter your email address (or a domain you own)
4. Follow the verification steps (click link in confirmation email)
5. Once verified, you can use this as `SMTP_FROM`

### Example:
```
SMTP_FROM=noreply@yourdomain.com
SMTP_FROM=support@awc-waste.com
SMTP_FROM=your-email@gmail.com (if verified)
```

---

## Step 4: Update `.env` File

Now that you have your credentials, update the file at:
```
backend/.env
```

### Find this section:
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_access_key
SMTP_PASS=your_brevo_secret_key
SMTP_SECURE=false
SMTP_FROM=noreply@awc.local
```

### Replace with your values:
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=user123456789abc@brevo.com
SMTP_PASS=xsmtp12345abcdefghij67890
SMTP_SECURE=false
SMTP_FROM=support@awc-waste.com
```

**⚠️ Important:**
- `SMTP_USER`: This is the "SMTP Login" from Brevo (also called Access Key)
- `SMTP_PASS`: This is the "SMTP Key" from Brevo (also called Secret Key)
- `SMTP_SECURE`: Keep as `false` (we're using port 587 TLS, not 465 SSL)
- `SMTP_FROM`: Use the verified sender email from step 3

---

## Step 5: Test SMTP Connection

Before restarting the backend, test that your configuration works:

```bash
# Navigate to backend directory
cd backend

# Run the SMTP connection tester
node test-smtp-connection.js
```

### Expected Output (Success):
```
========================================
  BREVO SMTP CONNECTION TESTER
========================================

[1/3] Checking SMTP configuration...
✓ Configuration found
  Host: smtp-relay.brevo.com
  Port: 587
  User: user123...abc@brevo.com
  Secure: false

[2/3] Creating SMTP transporter...
[3/3] Verifying SMTP connection...
✓ SMTP connection verified

========================================
  ✅ SMTP CONFIGURATION IS VALID
========================================

You can now use the forgot-password feature!
```

### If it fails:
```
❌ SMTP Connection Failed
   Error: Invalid login credentials

   Possible solutions:
   1. Verify SMTP_USER and SMTP_PASS are correct
   2. Check that your Brevo account email is verified
   3. Ensure firewall allows port 587 outbound
   4. Try refreshing your SMTP key in Brevo Settings
```

**Troubleshooting:**
- Double-check you copied the SMTP_USER and SMTP_PASS **exactly** (no extra spaces)
- Make sure your sender email is verified in Brevo
- Refresh your SMTP key in Brevo dashboard and try again

---

## Step 6: Restart Backend Server

Once the SMTP test passes, start your backend:

```bash
# From backend directory
node server.js
```

### Expected Startup Output:
```
[DB] Preparing database schema...
[CONFIG] Validating email configuration...
[SMTP] Configuration validated successfully
   Using Brevo SMTP: smtp-relay.brevo.com:587
[SERVER] Listening on port 5000
   API ready at http://localhost:5000
```

If you see:
```
[WARN] SMTP validation failed: Invalid login: 535 5.7.8 Authentication failed
```

This means your credentials are incorrect. Go back to step 4 and verify the SMTP_USER and SMTP_PASS.

---

## Step 7: Test Forgot-Password Flow

Now test the complete password reset flow:

### From the Login Page:
1. Open your app in browser (http://localhost:5173 or wherever frontend runs)
2. Go to **Login** page
3. Click **"Forgot Password?"** link
4. Enter a **registered resident email address** (must be in your database)
   - Example: `amina.bello@gmail.com`
5. Click **"Request Reset Code"**
6. **Check email inbox** (may take 5-30 seconds)
   - Look for email with subject: "AWC Password Reset Code"
   - Copy the 6-digit reset code
7. Back on the forgot-password modal:
   - Paste the reset code
   - Enter your new password (8+ characters)
   - Confirm password
8. Click **"Reset Password"**
9. You should see success message
10. **Login with your new password** to confirm it worked!

### Using cURL (Backend Test):

```bash
# Request password reset
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"amina.bello@gmail.com"}'

# Response:
# {"message":"If this resident email exists, a password reset code has been sent."}

# Check email for code (6 digits), then reset password:
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email":"amina.bello@gmail.com",
    "reset_code":"123456",
    "new_password":"NewPassword123"
  }'

# Response:
# {"message":"Password reset successful. You can now login with your new password."}
```

---

## ✅ Quick Checklist

- [ ] Visited https://www.brevo.com and created account
- [ ] Verified email address in Brevo
- [ ] Generated SMTP credentials (access key + secret key)
- [ ] Verified sender email in Brevo
- [ ] Updated `backend/.env` with SMTP credentials
- [ ] Ran `node test-smtp-connection.js` - **PASSED**
- [ ] Restarted backend server - see `[SMTP] Configuration validated`
- [ ] Tested forgot-password from login page
- [ ] Received reset code email
- [ ] Successfully reset password
- [ ] Logged in with new password - **SUCCESS!**

---

## 📊 Configuration Summary

| Item | Value | Where to Find |
|------|-------|---------------|
| SMTP_HOST | `smtp-relay.brevo.com` | (fixed) |
| SMTP_PORT | `587` | (fixed) |
| SMTP_SECURE | `false` | (fixed) |
| SMTP_USER | Your Brevo Access Key | Brevo → Settings → SMTP |
| SMTP_PASS | Your Brevo Secret Key | Brevo → Settings → SMTP |
| SMTP_FROM | Verified sender email | Brevo → Settings → Senders |

---

## 🆘 Troubleshooting

### Problem: "Email service is not configured"
**Solution:** Check that all required fields in `.env` are filled (not empty)

### Problem: "Authentication failed" or "535 5.7.8"
**Solution:** 
- Verify SMTP_USER and SMTP_PASS are copied exactly (no spaces)
- Regenerate SMTP key in Brevo and try again
- Ensure your Brevo account email is verified

### Problem: Email not received
**Solution:**
- Check spam/junk folder
- Wait 5-30 seconds (email delivery takes time)
- Verify the resident email exists in database
- Check Brevo dashboard "Transactional" logs for delivery status

### Problem: "Invalid or expired reset code"
**Solution:**
- Ensure email in reset form matches request form
- Reset codes expire after 15 minutes
- Can't reuse a code after first use
- Try requesting a new reset code

### Problem: Port blocked or timeout
**Solution:**
- Ensure firewall allows port 587 outbound
- Try using port 465 with `SMTP_SECURE=true` instead
- Check your network doesn't block SMTP

---

## 📚 References

- **Brevo Docs**: https://developers.brevo.com
- **SMTP Setup**: https://developers.brevo.com/docs/how-to-configure-smtp
- **Nodemailer**: https://nodemailer.com
- **AWC Backend Setup**: See `BREVO_SMTP_SETUP.md`

---

## 💡 Tips

1. **Free Plan Limits**: Brevo free tier allows 300 emails/day - should be plenty for testing
2. **Production Use**: For production, verify your domain's SPF/DKIM records in Brevo
3. **Security**: Never commit `.env` with real credentials to git
4. **Sender Email**: Must be verified in Brevo or emails will fail to send
5. **Reset Code**: 6-digit, expires 15 minutes after generation, hashed in database

---

Once you complete these steps, the forgot-password feature will be fully operational!
