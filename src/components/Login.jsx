import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService, { setZonesCache } from '../services/apiService';
import './Login.css';

function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [registerData, setRegisterData] = useState({
    full_name: '',
    email: '',
    phone: '',
    address_line: '',
    zone_id: '',
    password: '',
    confirmPassword: '',
  });

  const [error, setError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [zones, setZones] = useState([]);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  useEffect(() => {
    apiService.getZonesFromDB()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.zones || []);
        setZones(list);
        setZonesCache(list);
      })
      .catch(() => {});
  }, []);

  const [forgotStep, setForgotStep] = useState(1);
  const [forgotData, setForgotData] = useState({
    email: '',
    resetCode: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // ── Role hint buttons — only fill email placeholder, never authenticate ──
  const handleRoleHint = (role) => {
    const hints = {
      resident: 'Enter your resident email above',
      collector: 'Enter your collector email above',
      admin: 'Enter your admin email above',
    };
    setError('');
    // Focus the email field to guide the user
    document.getElementById('email')?.focus();
    // Show a subtle hint message without pre-filling credentials
    setError(hints[role] || '');
    // Clear the hint after 3 seconds so it doesn't look like a real error
    setTimeout(() => setError(''), 3000);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    // Always clear any stale session before logging in
    localStorage.removeItem('awc_user');

    try {
      const result = await apiService.login(formData.email, formData.password);
      const role = result?.user?.role || 'resident';

      localStorage.setItem(
        'awc_user',
        JSON.stringify({
          id: result.user.id,
          name: result.user.full_name,
          email: result.user.email,
          phone: result.user.phone,
          role,
          zone_id: result.user.zone_id,
          token: result.token,
          loggedIn: true,
        })
      );

      if (role === 'collector') {
        navigate('/dashboard/collector');
      } else if (role === 'admin' || role === 'super_admin') {
        navigate('/dashboard/admin');
      } else {
        navigate('/dashboard/user');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setRegisterError('');

    if (!registerData.zone_id) {
      setRegisterError('Please select a zone.');
      return;
    }

    if (registerData.password.length < 8) {
      setRegisterError('Password must be at least 8 characters.');
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      setRegisterError('Passwords do not match.');
      return;
    }

    setRegisterLoading(true);
    try {
      await apiService.register(registerData);
      setIsCreateAccountOpen(false);
      setFormData((prev) => ({ ...prev, email: registerData.email, password: '' }));
      setRegisterData({
        full_name: '',
        email: '',
        phone: '',
        address_line: '',
        zone_id: '',
        password: '',
        confirmPassword: '',
      });
      alert('Account created successfully. Please login.');
    } catch (err) {
      setRegisterError(err.message || 'Registration failed.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const openForgotPasswordModal = () => {
    setForgotData({
      email: formData.email || '',
      resetCode: '',
      newPassword: '',
      confirmPassword: '',
    });
    setForgotError('');
    setForgotSuccess('');
    setForgotStep(1);
    setIsForgotPasswordOpen(true);
  };

  const requestPasswordReset = async (event) => {
    event.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotData.email) {
      setForgotError('Please enter your registered resident email.');
      return;
    }

    setForgotLoading(true);
    try {
      const result = await apiService.forgotPassword(forgotData.email);
      setForgotSuccess(result?.message || 'If this resident email exists, a reset code has been sent.');
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.message || 'Failed to send reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const submitPasswordReset = async (event) => {
    event.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotData.resetCode || !forgotData.newPassword) {
      setForgotError('Reset code and new password are required.');
      return;
    }

    if (forgotData.newPassword.length < 8) {
      setForgotError('New password must be at least 8 characters.');
      return;
    }

    if (forgotData.newPassword !== forgotData.confirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    setForgotLoading(true);
    try {
      const result = await apiService.resetPassword(
        forgotData.email,
        forgotData.resetCode,
        forgotData.newPassword,
      );
      setForgotSuccess(result?.message || 'Password reset successful.');
      setFormData((prev) => ({ ...prev, email: forgotData.email, password: '' }));
      setTimeout(() => {
        setIsForgotPasswordOpen(false);
      }, 1200);
    } catch (err) {
      setForgotError(err.message || 'Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-illustration">
          <div className="illustration-content">
            <div className="illustration-icon">♻️</div>
            <h2>AWC Platform</h2>
            <p>Abuja Waste Collection Management System</p>
            <ul className="illustration-features">
              <li>📍 Track pickups in real time</li>
              <li>🗺️ Zone-based scheduling</li>
              <li>📊 Live reports &amp; analytics</li>
            </ul>
          </div>
        </div>

        <div className="login-container">
          <div className="login-header">
            <div className="logo">AWC</div>
            <h1>Welcome Back</h1>
            <p>Access your AWC dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                required
              />
            </div>

            <p className="forgot-password-link" onClick={openForgotPasswordModal}>
              Forgot password?
            </p>

            {error && (
              <div className={error.includes('Enter your') ? 'hint-message' : 'error-message'}>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Role hint buttons — guide users to the correct login, never auto-authenticate */}
          <div className="quick-login-section">
            <div className="quick-login-divider">
              <span>signing in as</span>
            </div>
            <div className="role-btn-group">
              <button
                type="button"
                onClick={() => handleRoleHint('resident')}
                className="role-btn user-btn"
                disabled={loading}
              >
                <span className="role-icon">🏠</span>
                <span>Resident</span>
              </button>
              <button
                type="button"
                onClick={() => handleRoleHint('collector')}
                className="role-btn collector-btn"
                disabled={loading}
              >
                <span className="role-icon">🚛</span>
                <span>Collector</span>
              </button>
              <button
                type="button"
                onClick={() => handleRoleHint('admin')}
                className="role-btn admin-btn"
                disabled={loading}
              >
                <span className="role-icon">🛡️</span>
                <span>Admin</span>
              </button>
            </div>
          </div>

          <p className="create-account-link" onClick={() => setIsCreateAccountOpen(true)}>
            Do not have an account? <span>Create Account</span>
          </p>

          <div className="back-link">
            <a href="/">Back to Home</a>
          </div>
        </div>
      </div>

      {/* ── Create Account Modal ── */}
      {isCreateAccountOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateAccountOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Account</h3>
              <button className="modal-close" onClick={() => setIsCreateAccountOpen(false)}>×</button>
            </div>
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  value={registerData.full_name}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, full_name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={registerData.email}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  required
                  value={registerData.phone}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  required
                  value={registerData.address_line}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, address_line: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Zone</label>
                <select
                  required
                  value={registerData.zone_id}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, zone_id: e.target.value }))}
                >
                  <option value="">Select Zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  value={registerData.password}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  required
                  value={registerData.confirmPassword}
                  onChange={(e) => setRegisterData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                />
              </div>
              {registerError && (
                <p style={{ color: '#e53935', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  {registerError}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setIsCreateAccountOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="cta-button" disabled={registerLoading}>
                  {registerLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Forgot Password Modal ── */}
      {isForgotPasswordOpen && (
        <div className="modal-overlay" onClick={() => setIsForgotPasswordOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Forgot Password</h3>
              <button className="modal-close" onClick={() => setIsForgotPasswordOpen(false)}>×</button>
            </div>

            {forgotStep === 1 ? (
              <form onSubmit={requestPasswordReset}>
                <p className="forgot-password-note">
                  Enter your resident account email to receive a password reset code.
                </p>
                <div className="form-group">
                  <label>Resident Email</label>
                  <input
                    type="email"
                    required
                    value={forgotData.email}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                {forgotError && <p className="forgot-password-error">{forgotError}</p>}
                {forgotSuccess && <p className="forgot-password-success">{forgotSuccess}</p>}
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setIsForgotPasswordOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="cta-button" disabled={forgotLoading}>
                    {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitPasswordReset}>
                <p className="forgot-password-note">
                  Check your email for the 6-digit reset code and set a new password.
                </p>
                <div className="form-group">
                  <label>Resident Email</label>
                  <input
                    type="email"
                    required
                    value={forgotData.email}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Reset Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="6-digit code"
                    value={forgotData.resetCode}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, resetCode: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    required
                    value={forgotData.newPassword}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, newPassword: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={forgotData.confirmPassword}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>
                {forgotError && <p className="forgot-password-error">{forgotError}</p>}
                {forgotSuccess && <p className="forgot-password-success">{forgotSuccess}</p>}
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setForgotStep(1)}>
                    Back
                  </button>
                  <button type="submit" className="cta-button" disabled={forgotLoading}>
                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
