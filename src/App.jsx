import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import './App.css'
import UserDashboard from './components/UserDashboard'
import AdminDashboard from './components/AdminDashboard'
import CollectorDashboard from './components/CollectorDashboard'
import Login from './components/Login'
import apiService, { setZonesCache } from './services/apiService'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [zones, setZones] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address_line: '',
    zone_id: '',
    password: '',
    confirmPassword: '',
  });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    apiService.getZonesFromDB()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.zones || []);
        setZones(list);
        setZonesCache(list);
      })
      .catch(() => {});
  }, []);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false); // Close menu after navigation
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsMenuOpen(false);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLoginClick = () => {
    window.location.href = '/login';
  };

  const openCreateAccount = () => {
    setCreateForm({
      full_name: '',
      email: '',
      phone: '',
      address_line: '',
      zone_id: '',
      password: '',
      confirmPassword: '',
    });
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!createForm.zone_id) {
      setCreateError('Please select a zone.');
      return;
    }

    if (createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    setCreateLoading(true);
    try {
      await apiService.register(createForm);
      setShowCreateModal(false);
      window.location.href = '/login';
    } catch (err) {
      setCreateError(err.message || 'Registration failed.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard/user" element={<UserDashboard />} />
      <Route path="/dashboard/admin" element={<AdminDashboard />} />
      <Route path="/dashboard/collector" element={<CollectorDashboard />} />
      <Route path="/" element={
        <div className="app">
          <nav className="navbar">
            <div className="nav-container">
              <div className="nav-logo" onClick={scrollToTop} style={{cursor: 'pointer'}}>
                <span className="logo-icon">♻️</span> AWC
              </div>
              <div className="nav-menu">
                <ul className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
                  <li><a href="#about" onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>About</a></li>
                  <li><a href="#services" onClick={(e) => { e.preventDefault(); scrollToSection('services'); }}>Services</a></li>
                  <li><a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollToSection('how-it-works'); }}>How It Works</a></li>
                  <li><a href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection('contact'); }}>Contact</a></li>
                  <li><a href="/login" className="nav-login-btn" onClick={(e) => { e.preventDefault(); handleLoginClick(); }}>Login</a></li>
                </ul>
                <div className="hamburger" onClick={toggleMenu}>
                  <span className={`bar ${isMenuOpen ? 'active' : ''}`}></span>
                  <span className={`bar ${isMenuOpen ? 'active' : ''}`}></span>
                  <span className={`bar ${isMenuOpen ? 'active' : ''}`}></span>
                </div>
              </div>
            </div>
          </nav>

          {/* HERO */}
          <section className="hero">
            <div className="hero-overlay"></div>
            <div className="hero-content">
              <span className="hero-badge">🌿 Abuja's #1 Waste Management Service</span>
              <h1>Keeping the FCT Clean,<br />One Pickup at a Time</h1>
              <p>Professional waste collection, recycling, and disposal services for a cleaner, greener Abuja. Join over 10,000 residents who trust AWC.</p>
              <div className="hero-buttons">
                <button className="cta-button" onClick={openCreateAccount}>Create Account</button>
                <button className="cta-button secondary" onClick={() => window.location.href = '/login'}>Login</button>
              </div>
              <div className="hero-stats-bar">
                <div className="hero-stat"><strong>10,000+</strong><span>Residents Served</span></div>
                <div className="hero-stat-divider"></div>
                <div className="hero-stat"><strong>50+</strong><span>Collection Trucks</span></div>
                <div className="hero-stat-divider"></div>
                <div className="hero-stat"><strong>98%</strong><span>On-Time Rate</span></div>
                <div className="hero-stat-divider"></div>
                <div className="hero-stat"><strong>5 Years</strong><span>Of Service</span></div>
              </div>
            </div>
          </section>

          {/* ABOUT */}
          <section id="about" className="about">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">Who We Are</span>
                <h2>About Abuja Waste Collectors</h2>
                <p className="section-subtitle">Dedicated to building a sustainable future for the Federal Capital Territory</p>
              </div>
              <div className="about-content">
                <div className="about-image">
                  <img src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&h=400&fit=crop" alt="Waste collection team" />
                  <div className="about-image-badge">
                    <strong>5+</strong>
                    <span>Years of Excellence</span>
                  </div>
                </div>
                <div className="about-text">
                  <h3>Building a Cleaner Abuja Together</h3>
                  <p>Abuja Waste Collectors (AWC) is dedicated to maintaining a clean and sustainable Federal Capital Territory. Our mission is to provide efficient, eco-friendly waste collection services to residents and businesses across Abuja.</p>
                  <p>We specialize in proper waste segregation and disposal, ensuring that plastics, organic waste, and electronic waste are handled responsibly to protect our environment.</p>
                  <div className="about-features">
                    <div className="about-feature"><span className="feature-icon">✅</span><span>Eco-friendly waste disposal methods</span></div>
                    <div className="about-feature"><span className="feature-icon">✅</span><span>Real-time truck tracking for residents</span></div>
                    <div className="about-feature"><span className="feature-icon">✅</span><span>Proper waste segregation & recycling</span></div>
                    <div className="about-feature"><span className="feature-icon">✅</span><span>Reliable on-schedule pickups across zones</span></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SERVICES */}
          <section id="services" className="services">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">What We Offer</span>
                <h2>Our Services</h2>
                <p className="section-subtitle">Comprehensive waste management solutions tailored for Abuja</p>
              </div>
              <div className="services-grid">
                <div className="service-card">
                  <div className="service-img">
                    <img src="https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=400&h=250&fit=crop" alt="Residential waste collection" />
                  </div>
                  <div className="service-body">
                    <h3>Residential Collection</h3>
                    <p>Scheduled door-to-door waste pickup for homes across all zones in the FCT. Reliable and convenient.</p>
                  </div>
                </div>
                <div className="service-card">
                  <div className="service-img">
                    <img src="https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?w=400&h=250&fit=crop" alt="Recycling services" />
                  </div>
                  <div className="service-body">
                    <h3>Recycling Services</h3>
                    <p>We sort and recycle plastics, paper, glass, and metals. Helping reduce landfill waste and conserve resources.</p>
                  </div>
                </div>
                <div className="service-card">
                  <div className="service-img">
                    <img src="https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=400&h=250&fit=crop" alt="E-waste disposal" />
                  </div>
                  <div className="service-body">
                    <h3>E-Waste Disposal</h3>
                    <p>Responsible handling and disposal of electronic waste including phones, computers, and appliances.</p>
                  </div>
                </div>
                <div className="service-card">
                  <div className="service-img">
                    <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=250&fit=crop" alt="Commercial waste management" />
                  </div>
                  <div className="service-body">
                    <h3>Commercial Waste</h3>
                    <p>Tailored waste management for businesses, offices, and commercial establishments across Abuja.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section id="how-it-works" className="how-it-works">
            <div className="container">
              <div className="section-header">
                <span className="section-tag">Simple Process</span>
                <h2>How It Works</h2>
                <p className="section-subtitle">Get started with AWC in three easy steps</p>
              </div>
              <div className="steps">
                <div className="step-card">
                  <div className="step-number">1</div>
                  <div className="step-icon">📋</div>
                  <h3>Schedule a Pickup</h3>
                  <p>Sign in to your account and schedule a waste pickup at your preferred date and time. Choose your waste category.</p>
                </div>
                <div className="step-connector">→</div>
                <div className="step-card">
                  <div className="step-number">2</div>
                  <div className="step-icon">🚛</div>
                  <h3>Track Our Truck</h3>
                  <p>Monitor the real-time location of your assigned collection truck on our live map. Know exactly when to expect us.</p>
                </div>
                <div className="step-connector">→</div>
                <div className="step-card">
                  <div className="step-number">3</div>
                  <div className="step-icon">♻️</div>
                  <h3>Waste Collected</h3>
                  <p>Our team collects and properly disposes of your waste. Earn eco points and track your environmental impact.</p>
                </div>
              </div>
            </div>
          </section>

          {/* CTA BANNER */}
          <section className="cta-banner">
            <div className="cta-banner-overlay"></div>
            <div className="container cta-banner-content">
              <h2>Ready to Keep Your Neighbourhood Clean?</h2>
              <p>Join thousands of Abuja residents who trust AWC for reliable and eco-friendly waste collection.</p>
              <button className="cta-button" onClick={() => window.location.href = '/login'}>Get Started Today</button>
            </div>
          </section>

          {/* CONTACT / FOOTER */}
          <footer id="contact" className="footer">
            <div className="container">
              <div className="footer-content">
                <div className="footer-section">
                  <h4>♻️ Abuja Waste Collectors</h4>
                  <p>Keeping the FCT clean, one pickup at a time. Professional waste collection and recycling services.</p>
                  <div className="footer-socials">
                    <a href="#">📘</a>
                    <a href="#">🐦</a>
                    <a href="#">📸</a>
                  </div>
                </div>
                <div className="footer-section">
                  <h4>Quick Links</h4>
                  <ul>
                    <li><a href="#about" onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>About Us</a></li>
                    <li><a href="#services" onClick={(e) => { e.preventDefault(); scrollToSection('services'); }}>Services</a></li>
                    <li><a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollToSection('how-it-works'); }}>How It Works</a></li>
                    <li><a href="/login" onClick={(e) => { e.preventDefault(); handleLoginClick(); }}>Resident Login</a></li>
                  </ul>
                </div>
                <div className="footer-section">
                  <h4>Contact Info</h4>
                  <p>📞 +234 800 AWC HELP</p>
                  <p>📧 info@abujawastecollectors.ng</p>
                  <p>📍 Plot 123, Central Business District, Abuja, Nigeria</p>
                </div>
                <div className="footer-section">
                  <h4>Operating Hours</h4>
                  <p>Monday – Friday: 8:00 AM – 6:00 PM</p>
                  <p>Saturday: 8:00 AM – 2:00 PM</p>
                  <p>Sunday: Closed</p>
                </div>
              </div>
              <div className="footer-bottom">
                <p>&copy; 2026 Abuja Waste Collectors. All rights reserved.</p>
              </div>
            </div>
          </footer>

          {/* ══════ CREATE ACCOUNT MODAL ══════ */}
          {showCreateModal && (
            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Create Account</h3>
                  <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
                </div>
                <form onSubmit={handleCreateAccount}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" required value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Amara Okafor" />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" required value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. amara@example.com" />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input type="tel" required value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. +234 800 000 0000" />
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input type="text" required value={createForm.address_line} onChange={e => setCreateForm(f => ({ ...f, address_line: e.target.value }))} placeholder="e.g. 18 Aminu Kano Crescent, Wuse II, Abuja" />
                  </div>
                  <div className="form-group">
                    <label>Zone</label>
                    <select required value={createForm.zone_id} onChange={e => setCreateForm(f => ({ ...f, zone_id: e.target.value }))}>
                      <option value="">Select Zone</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" required value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 characters" />
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <input type="password" required value={createForm.confirmPassword} onChange={e => setCreateForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat password" />
                  </div>
                  {createError && <p style={{color:'#e53935',fontSize:'0.9rem',marginBottom:'0.75rem'}}>{createError}</p>}
                  <div className="modal-actions">
                    <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                    <button type="submit" className="cta-button" disabled={createLoading}>{createLoading ? 'Creating...' : 'Create Account'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      } />
    </Routes>
  )
}

export default App
