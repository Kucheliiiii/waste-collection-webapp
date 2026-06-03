# Brevo SMTP Setup Guide for AWC Forgot-Password Feature

This guide walks you through setting up Brevo SMTP for the forgot-password email service.

## Step 1: Create a Free Brevo Account

1. Visit [https://www.brevo.com](https://www.brevo.com)
2. Click **"Sign Up"** and select **Free plan**
3. Enter your email address, password, and organization name
4. Click **Create my account**
5. Verify your email address via the confirmation link sent to your inbox

## Step 2: Generate SMTP Credentials

1. Log in to [https://app.brevo.com](https://app.brevo.com)
2. Go to **Settings** > **SMTP & API** (or **Keys** section)
3. Click **"Create a new SMTP key"** or **"Generate new API key"**
4. You'll see:
   - **SMTP User**: Also called "Access Key" (format: `email@example.com` or alphanumeric ID)
   - **SMTP Password**: Also called "Secret Key" (long alphanumeric string)

**⚠️ IMPORTANT:** Copy both values immediately—you won't be able to see the password again.

## Step 3: Configure .env File

Open `backend/.env` and update the SMTP settings:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_access_key
SMTP_PASS=your_brevo_secret_key
SMTP_SECURE=false
SMTP_FROM=noreply@awc.local
```

**Example with real values:**
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=xsmtpabc123xyz456789
SMTP_SECURE=false
SMTP_FROM=noreply@waste-collection.local
```

### Field Descriptions:
- **SMTP_HOST**: Brevo SMTP server (always `smtp-relay.brevo.com`)
- **SMTP_PORT**: Port 587 (TLS) or 465 (SSL). Use `587` and `SMTP_SECURE=false`
- **SMTP_USER**: Your Brevo SMTP access key
- **SMTP_PASS**: Your Brevo SMTP secret key
- **SMTP_SECURE**: Set to `false` for port 587, `true` for port 465
- **SMTP_FROM**: Sender email address (can be any valid email format)

## Step 4: Restart the Backend Server

Stop the currently running backend server and restart it:

```bash
# Terminal in backend/ directory
node server.js
```

### Expected Startup Output:

✅ **Success:**
```
[DB] Preparing database schema...
[CONFIG] Validating email configuration...
[SMTP] Configuration validated successfully
   Using Brevo SMTP: smtp-relay.brevo.com:587
[SERVER] Listening on port 5000
   API ready at http://localhost:5000
```

❌ **Missing Credentials:**
```
[DB] Preparing database schema...
[CONFIG] Validating email configuration...
[WARN] Email service not configured. Missing: SMTP_USER, SMTP_PASS
   Forgot-password feature will not work until SMTP credentials are added to .env
[SERVER] Listening on port 5000
```

## Step 5: Test Forgot-Password Flow

### Frontend Test:
1. Open the app in your browser
2. Navigate to the **Login** page
3. Click **"Forgot Password?"** link
4. Enter a registered resident email address (e.g., `amina.bello@gmail.com`)
5. Click **Request Reset Code**
6. Check the registered email inbox for reset code (may take 5-30 seconds)
7. Enter the reset code and new password
8. Click **Reset Password**
9. Log in with your new password

### Backend Test (cURL):
```bash
# Test 1: Request password reset
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"amina.bello@gmail.com"}'

# Expected response:
# {"message":"If this resident email exists, a password reset code has been sent."}

# Test 2: Reset password with code (check email for code)
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email":"amina.bello@gmail.com",
    "reset_code":"123456",
    "new_password":"NewPassword123"
  }'

# Expected response:
# {"message":"Password reset successful. You can now login with your new password."}
```

## Troubleshooting

### Email Not Received

**Problem:** Password reset code sent but email never arrives

**Solutions:**
1. **Check spam/junk folder** - Brevo emails may be flagged as spam initially
2. **Verify SMTP credentials** - Ensure you copied the correct access key and secret key from Brevo dashboard
3. **Check server startup logs** - Look for `[SMTP] Configuration validated` message
4. **Verify email exists** - The recipient email must be a registered resident account
5. **Wait a few seconds** - Email delivery can take 5-30 seconds
6. **Check Brevo logs**:
   - Log in to [https://app.brevo.com](https://app.brevo.com)
   - Go to **Campaigns** > **Transactional** to see delivery status

### SMTP Validation Failed

**Problem:** Server shows `[WARN] SMTP validation failed`

**Solutions:**
1. **Check credentials are correct** - Copy/paste again from Brevo dashboard
2. **Check firewall** - Ensure port 587 is not blocked
3. **Verify host** - Should be exactly `smtp-relay.brevo.com`
4. **Try different port** - Use port 465 with `SMTP_SECURE=true` instead

### Reset Code Not Working

**Problem:** Entered correct reset code but get "Invalid or expired reset code"

**Solutions:**
1. **Check code expiry** - Reset codes expire in 15 minutes (configurable in .env with `RESET_CODE_EXPIRY_MINUTES`)
2. **Verify email matches** - Email in reset request must match email in reset form
3. **Copy code exactly** - Ensure no extra spaces at beginning/end
4. **Only one code per email** - Previous unused codes are invalidated when new code is requested

## Configuration Reference

### Email Format
- **From Address**: `noreply@awc.local` (customize by setting `SMTP_FROM`)
- **Subject**: `AWC Password Reset Code`
- **Content**: Text + HTML versions included

### Security Features
- **Code Generation**: Cryptographically secure 6-digit code
- **Code Hashing**: SHA-256 hashed before database storage
- **Expiry**: 15 minutes (configurable)
- **One-Time Use**: Code marked as used after successful reset
- **SQL Injection Protection**: Parameterized queries used throughout

### Environment Variables Summary
```env
# Database (existing)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=awc_new
PORT=5000
JWT_SECRET=awc_new_secret_change_me

# Brevo SMTP (new)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_access_key
SMTP_PASS=your_brevo_secret_key
SMTP_SECURE=false
SMTP_FROM=noreply@awc.local

# Optional
RESET_CODE_EXPIRY_MINUTES=15
```

## Production Considerations

### Before Deploying to Production:

1. **Use verified sender email** - Set `SMTP_FROM` to a domain you own or verified in Brevo
2. **Enable SPF/DKIM** - Brevo provides setup instructions for sender domain verification
3. **Monitor email quota** - Free Brevo tier has sending limits; upgrade if needed
4. **Set up bounce handling** - Configure Brevo webhooks for bounce/complaint notifications
5. **Use environment-specific credentials** - Don't share SMTP keys across environments
6. **Enable TLS** - Keep `SMTP_SECURE=false` with port 587 for TLS encryption
7. **Add reply-to address** - Consider updating email template to include support contact
8. **Log SMTP events** - Current setup logs failures; consider adding success logging

## Support

- **Brevo Docs**: [https://developers.brevo.com](https://developers.brevo.com)
- **SMTP Guide**: [https://developers.brevo.com/docs/how-to-configure-smtp](https://developers.brevo.com/docs/how-to-configure-smtp)
- **Nodemailer Docs**: [https://nodemailer.com](https://nodemailer.com)

## Quick Checklist

- [ ] Create free Brevo account
- [ ] Generate SMTP credentials (access key + secret key)
- [ ] Copy credentials to backend/.env
- [ ] Restart backend server
- [ ] Verify `[SMTP] Configuration validated` in startup logs
- [ ] Test forgot-password on login page
- [ ] Check email inbox for reset code
- [ ] Complete password reset and verify login works
