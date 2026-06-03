import { useEffect, useMemo, useState } from 'react';
import apiService from '../services/apiService';
import './Dashboard.css';

const EMPTY_COLLECTOR_FORM = {
  full_name: '',
  email: '',
  phone: '',
  employee_code: '',
  address_line: '',
  home_zone_id: '',
  current_zone_id: '',
  availability_status: 'available',
  password: '',
  confirmPassword: '',
};

const EMPTY_ADMIN_FORM = {
  full_name: '',
  email: '',
  phone: '',
  address_line: '',
  password: '',
  confirmPassword: '',
};

const EMPTY_ZONE_FORM = {
  zone_name: '',
  latitude: '',
  longitude: '',
};

const EMPTY_TRUCK_FORM = {
  truck_code: '',
  plate_number: '',
  model_name: '',
  capacity_kg: '',
  average_speed_kmh: '28',
  current_zone_id: '',
  truck_status: 'available',
};

const TRUCK_STATUSES = ['available', 'assigned', 'maintenance', 'inactive'];

function AdminDashboard() {
  const [admin, setAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [collectors, setCollectors] = useState([]);
  const [activities, setActivities] = useState([]);
  const [pickupsPerZone, setPickupsPerZone] = useState([]);
  const [completionRates, setCompletionRates] = useState(null);
  const [collectorPerformance, setCollectorPerformance] = useState([]);
  const [pickupRequests, setPickupRequests] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState(apiService.getPaymentSettings());
  const [billingForm, setBillingForm] = useState({
    rate_per_kg: String(apiService.getPaymentSettings().rate_per_kg),
    currency: apiService.getPaymentSettings().currency,
  });
  const [paymentVersion, setPaymentVersion] = useState(0);
  const [collectorForm, setCollectorForm] = useState(EMPTY_COLLECTOR_FORM);
  const [editingCollectorId, setEditingCollectorId] = useState(null);
  const [collectorFormOpen, setCollectorFormOpen] = useState(false);
  const [collectorFormLoading, setCollectorFormLoading] = useState(false);

  // ── Admin Management state ──────────────────────────────────────────────
  const [admins, setAdmins] = useState([]);
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN_FORM);
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [adminFormOpen, setAdminFormOpen] = useState(false);
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [resetPasswordAdminId, setResetPasswordAdminId] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  // ────────────────────────────────────────────────────────────────────────

  // ── Zone Management state ────────────────────────────────────────────────
  const [zones, setZones] = useState([]);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE_FORM);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [zoneFormOpen, setZoneFormOpen] = useState(false);
  const [zoneFormLoading, setZoneFormLoading] = useState(false);
  const [zoneGeocodingLoading, setZoneGeocodingLoading] = useState(false);
  const [zoneGeocodingError, setZoneGeocodingError] = useState('');
  // ────────────────────────────────────────────────────────────────────────

  // ── Truck Management state ───────────────────────────────────────────────
  const [trucks, setTrucks] = useState([]);
  const [truckForm, setTruckForm] = useState(EMPTY_TRUCK_FORM);
  const [editingTruckId, setEditingTruckId] = useState(null);
  const [truckFormOpen, setTruckFormOpen] = useState(false);
  const [truckFormLoading, setTruckFormLoading] = useState(false);
  // ────────────────────────────────────────────────────────────────────────

  // ── Pickup Requests tab state ────────────────────────────────────────────
  const [pickupStatusFilter, setPickupStatusFilter] = useState('all');
  const [pickupSearchQuery, setPickupSearchQuery] = useState('');
  const [pickupExpandedId, setPickupExpandedId] = useState(null);
  const [pickupAssigningIds, setPickupAssigningIds] = useState(new Set());
  const [pickupCancellingIds, setPickupCancellingIds] = useState(new Set());
  // ────────────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('awc_user');
    if (!stored) {
      window.location.href = '/login';
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!parsed?.token || (parsed.role !== 'admin' && parsed.role !== 'super_admin')) {
        // Stale or wrong-role session — clear and force re-login
        localStorage.removeItem('awc_user');
        window.location.href = '/login';
        return;
      }
      setAdmin(parsed);
    } catch {
      localStorage.removeItem('awc_user');
      window.location.href = '/login';
    }
  }, []);

  const loadCollectors = async () => {
    const rows = await apiService.getCollectors();
    setCollectors(rows);
  };

  const loadAdmins = async () => {
    try {
      const rows = await apiService.getAdmins();
      setAdmins(rows);
    } catch (err) {
      // Silently ignore if role is not permitted
      console.warn('loadAdmins:', err.message);
    }
  };

  const loadZones = async () => {
    try {
      const rows = await apiService.getZonesFromDB();
      setZones(rows);
    } catch (err) {
      console.warn('loadZones:', err.message);
    }
  };

  const loadTrucks = async () => {
    try {
      const rows = await apiService.getTrucks();
      setTrucks(rows);
    } catch (err) {
      console.warn('loadTrucks:', err.message);
    }
  };

  const loadActivities = async () => {
    const rows = await apiService.getActivities(200);
    setActivities(rows);
  };

  const loadReports = async () => {
    const [zoneRows, completionRow, performanceRows] = await Promise.all([
      apiService.getPickupsPerZone(),
      apiService.getCompletionRates(),
      apiService.getCollectorPerformance(),
    ]);

    setPickupsPerZone(zoneRows);
    setCompletionRates(completionRow);
    setCollectorPerformance(performanceRows);
  };

  const loadPickupRequests = async () => {
    const rows = await apiService.getPickupRequests();
    setPickupRequests(rows);
  };

  const loadAll = async () => {
    setLoading(true);
    setError('');

    try {
      await Promise.all([loadCollectors(), loadAdmins(), loadZones(), loadTrucks(), loadActivities(), loadReports(), loadPickupRequests()]);
      setPaymentSettings(apiService.getPaymentSettings());
    } catch (err) {
      setError(err.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const dashboardStats = useMemo(() => {
    const totalCollectors = collectors.length;
    const availableCollectors = collectors.filter((item) => item.availability_status === 'available').length;
    const busyCollectors = collectors.filter((item) => item.availability_status === 'busy').length;

    const totalRequests = completionRates?.total_requests || 0;
    const completedRequests = completionRates?.completed_requests || 0;
    const totalCharge = pickupRequests.reduce((sum, row) => {
      const charge = apiService.calculatePickupCharge(row.estimated_weight_kg || 0);
      return sum + charge.amount;
    }, 0);
    const totalPaid = pickupRequests.reduce((sum, row) => {
      const paid = apiService.getPaymentForRequest(row.id);
      return sum + Number(paid?.amount || 0);
    }, 0);

    return {
      totalCollectors,
      availableCollectors,
      busyCollectors,
      totalRequests,
      completedRequests,
      totalCharge,
      totalPaid,
    };
  }, [collectors, completionRates, pickupRequests, paymentVersion]);

  const formatMoney = (amount, currency = paymentSettings.currency) => {
    try {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(Number(amount || 0));
    } catch {
      return `${currency} ${Number(amount || 0).toFixed(2)}`;
    }
  };

  const changeCollectorAvailability = async (collectorUserId, availabilityStatus) => {
    if (!admin?.id) {
      setError('Admin session missing. Please login again.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      await apiService.updateCollectorAvailability(collectorUserId, availabilityStatus, admin.id);
      setSuccess(`Collector ${collectorUserId} updated to ${availabilityStatus}.`);
      await loadCollectors();
      await loadActivities();
      await loadReports();
      await loadPickupRequests();
    } catch (err) {
      setError(err.message || 'Failed to update collector availability.');
    }
  };

  const updateBillingSettings = (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const nextRate = Number(billingForm.rate_per_kg);
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      setError('Rate per kg must be greater than 0.');
      return;
    }

    const nextSettings = apiService.updatePaymentSettings({
      rate_per_kg: nextRate,
      currency: billingForm.currency || 'NGN',
    });

    setPaymentSettings(nextSettings);
    setSuccess(`Billing updated: ${formatMoney(nextSettings.rate_per_kg, nextSettings.currency)} per kg.`);
    setPaymentVersion((prev) => prev + 1);
  };

  const resetCollectorForm = () => {
    setCollectorForm(EMPTY_COLLECTOR_FORM);
    setEditingCollectorId(null);
    setCollectorFormOpen(false);
  };

  const openCreateCollectorForm = () => {
    setError('');
    setSuccess('');
    setCollectorForm(EMPTY_COLLECTOR_FORM);
    setEditingCollectorId(null);
    setCollectorFormOpen(true);
  };

  const openEditCollectorForm = (collector) => {
    setError('');
    setSuccess('');
    setEditingCollectorId(collector.collector_user_id);
    setCollectorForm({
      full_name: collector.full_name || '',
      email: collector.email || '',
      phone: collector.phone || '',
      employee_code: collector.employee_code || '',
      address_line: collector.address_line || '',
      home_zone_id: String(apiService.mapZoneNameToId(collector.home_zone) || ''),
      current_zone_id: String(apiService.mapZoneNameToId(collector.current_zone) || ''),
      availability_status: collector.availability_status || 'available',
      password: '',
      confirmPassword: '',
    });
    setCollectorFormOpen(true);
  };

  const submitCollectorForm = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!collectorForm.home_zone_id || !collectorForm.current_zone_id) {
      setError('Home zone and current zone are required.');
      return;
    }

    if (!editingCollectorId && collectorForm.password.length < 8) {
      setError('Password must be at least 8 characters for new collectors.');
      return;
    }

    if (collectorForm.password && collectorForm.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (collectorForm.password !== collectorForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setCollectorFormLoading(true);
    try {
      const payload = {
        ...collectorForm,
        actor_user_id: admin?.id,
      };

      if (editingCollectorId) {
        await apiService.updateCollector(editingCollectorId, payload);
        setSuccess('Collector updated successfully.');
      } else {
        const result = await apiService.createCollector(payload);
        setSuccess(`Collector created successfully${result.employee_code ? ` (${result.employee_code})` : ''}.`);
      }

      resetCollectorForm();
      await loadCollectors();
      await loadActivities();
      await loadReports();
    } catch (err) {
      setError(err.message || 'Failed to save collector.');
    } finally {
      setCollectorFormLoading(false);
    }
  };

  const handleDeleteCollector = async (collector) => {
    setError('');
    setSuccess('');

    const confirmed = window.confirm(
      `Delete collector ${collector.full_name}? Existing assignment history will be archived instead of removed.`
    );
    if (!confirmed) {
      return;
    }

    try {
      const result = await apiService.deleteCollector(collector.collector_user_id, admin?.id);
      setSuccess(result.message || 'Collector deleted successfully.');
      if (editingCollectorId === collector.collector_user_id) {
        resetCollectorForm();
      }
      await loadCollectors();
      await loadActivities();
      await loadReports();
    } catch (err) {
      setError(err.message || 'Failed to delete collector.');
    }
  };

  // ── Truck Management handlers ────────────────────────────────────────────
  const resetTruckForm = () => {
    setTruckForm(EMPTY_TRUCK_FORM);
    setEditingTruckId(null);
    setTruckFormOpen(false);
  };

  const openCreateTruckForm = () => {
    setError('');
    setSuccess('');
    setTruckForm(EMPTY_TRUCK_FORM);
    setEditingTruckId(null);
    setTruckFormOpen(true);
  };

  const openEditTruckForm = (truck) => {
    setError('');
    setSuccess('');
    setEditingTruckId(truck.id);
    setTruckForm({
      truck_code: truck.truck_code || '',
      plate_number: truck.plate_number || '',
      model_name: truck.model_name || '',
      capacity_kg: String(truck.capacity_kg),
      average_speed_kmh: String(truck.average_speed_kmh),
      current_zone_id: String(truck.current_zone_id),
      truck_status: truck.truck_status || 'available',
    });
    setTruckFormOpen(true);
  };

  const submitTruckForm = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setTruckFormLoading(true);
    try {
      if (editingTruckId) {
        await apiService.updateTruck(editingTruckId, truckForm);
        setSuccess('Truck updated successfully.');
      } else {
        await apiService.createTruck(truckForm);
        setSuccess('Truck added successfully.');
      }
      resetTruckForm();
      await loadTrucks();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to save truck.');
    } finally {
      setTruckFormLoading(false);
    }
  };

  const handleUpdateTruckStatus = async (truck, newStatus) => {
    setError('');
    setSuccess('');
    try {
      const result = await apiService.updateTruckStatus(truck.id, newStatus);
      setSuccess(result.message || `Truck ${truck.truck_code} → ${newStatus}.`);
      await loadTrucks();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to update truck status.');
    }
  };

  const handleDeleteTruck = async (truck) => {
    setError('');
    setSuccess('');
    if (!window.confirm(`Delete truck ${truck.truck_code} (${truck.plate_number})? This cannot be undone.`)) return;
    try {
      const result = await apiService.deleteTruck(truck.id);
      setSuccess(result.message || 'Truck deleted.');
      if (editingTruckId === truck.id) resetTruckForm();
      await loadTrucks();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to delete truck.');
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Zone Management handlers ─────────────────────────────────────────────
  const resetZoneForm = () => {
    setZoneForm(EMPTY_ZONE_FORM);
    setEditingZoneId(null);
    setZoneFormOpen(false);
    setZoneGeocodingError('');
  };

  const geocodeZoneName = async () => {
    const name = zoneForm.zone_name.trim();
    if (!name) {
      setZoneGeocodingError('Enter a zone name first.');
      return;
    }
    setZoneGeocodingLoading(true);
    setZoneGeocodingError('');
    try {
      const query = encodeURIComponent(`${name}, Abuja, Nigeria`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ng`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'AWC-App/1.0' } }
      );
      const data = await res.json();
      if (!data || data.length === 0) {
        setZoneGeocodingError(`Could not find coordinates for "${name}". Enter manually.`);
        return;
      }
      const { lat, lon } = data[0];
      setZoneForm((prev) => ({
        ...prev,
        latitude: Number(lat).toFixed(6),
        longitude: Number(lon).toFixed(6),
      }));
    } catch {
      setZoneGeocodingError('Geocoding failed. Check your connection or enter coordinates manually.');
    } finally {
      setZoneGeocodingLoading(false);
    }
  };

  const openCreateZoneForm = () => {
    setError('');
    setSuccess('');
    setZoneForm(EMPTY_ZONE_FORM);
    setEditingZoneId(null);
    setZoneFormOpen(true);
  };

  const openEditZoneForm = (zone) => {
    setError('');
    setSuccess('');
    setEditingZoneId(zone.id);
    setZoneForm({
      zone_name: zone.zone_name || '',
      latitude: String(zone.latitude),
      longitude: String(zone.longitude),
    });
    setZoneFormOpen(true);
  };

  const submitZoneForm = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const lat = Number(zoneForm.latitude);
    const lng = Number(zoneForm.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Longitude must be between -180 and 180.');
      return;
    }

    setZoneFormLoading(true);
    try {
      if (editingZoneId) {
        const currentZone = zones.find((z) => z.id === editingZoneId);
        await apiService.updateZone(editingZoneId, {
          ...zoneForm,
          is_active: currentZone ? Boolean(currentZone.is_active) : true,
        });
        setSuccess('Zone updated successfully.');
      } else {
        await apiService.createZone(zoneForm);
        setSuccess('Zone created successfully.');
      }
      resetZoneForm();
      await loadZones();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to save zone.');
    } finally {
      setZoneFormLoading(false);
    }
  };

  const handleToggleZoneStatus = async (zone) => {
    setError('');
    setSuccess('');
    const nextActive = !zone.is_active;
    try {
      const result = await apiService.toggleZoneStatus(zone.id, nextActive);
      setSuccess(result.message || `Zone ${nextActive ? 'activated' : 'deactivated'}.`);
      await loadZones();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to update zone status.');
    }
  };

  const handleDeleteZone = async (zone) => {
    setError('');
    setSuccess('');
    if (!window.confirm(`Delete zone "${zone.zone_name}"? This cannot be undone.`)) return;
    try {
      const result = await apiService.deleteZone(zone.id);
      setSuccess(result.message || 'Zone deleted.');
      if (editingZoneId === zone.id) resetZoneForm();
      await loadZones();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to delete zone.');
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Pickup Requests handlers ─────────────────────────────────────────────
  const handleAssignNearest = async (requestId) => {
    setError('');
    setSuccess('');
    setPickupAssigningIds((prev) => new Set([...prev, requestId]));
    try {
      const result = await apiService.assignNearestCollectorAndTruck(requestId, admin?.id);
      setSuccess(result.message || 'Collector and truck assigned successfully.');
      await loadPickupRequests();
      await loadCollectors();
      await loadTrucks();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to assign collector and truck.');
    } finally {
      setPickupAssigningIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleCancelPickup = async (request) => {
    setError('');
    setSuccess('');
    if (!window.confirm(`Cancel request ${request.request_code}? This will free up any assigned collector and truck.`)) return;
    setPickupCancellingIds((prev) => new Set([...prev, request.id]));
    try {
      const result = await apiService.cancelPickupRequest(request.id, admin?.id);
      setSuccess(result.message || 'Pickup request cancelled.');
      setPickupExpandedId(null);
      await loadPickupRequests();
      await loadCollectors();
      await loadTrucks();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to cancel pickup request.');
    } finally {
      setPickupCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    localStorage.removeItem('awc_user');
    window.location.href = '/';
  };

  // ── Admin Management handlers ────────────────────────────────────────────
  const resetAdminForm = () => {
    setAdminForm(EMPTY_ADMIN_FORM);
    setEditingAdminId(null);
    setAdminFormOpen(false);
  };

  const openCreateAdminForm = () => {
    setError('');
    setSuccess('');
    setAdminForm(EMPTY_ADMIN_FORM);
    setEditingAdminId(null);
    setAdminFormOpen(true);
  };

  const openEditAdminForm = (adminUser) => {
    setError('');
    setSuccess('');
    setEditingAdminId(adminUser.id);
    setAdminForm({
      full_name: adminUser.full_name || '',
      email: adminUser.email || '',
      phone: adminUser.phone || '',
      address_line: adminUser.address_line || '',
      password: '',
      confirmPassword: '',
    });
    setAdminFormOpen(true);
  };

  const submitAdminForm = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!editingAdminId && adminForm.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setAdminFormLoading(true);
    try {
      if (editingAdminId) {
        await apiService.updateAdmin(editingAdminId, adminForm);
        setSuccess('Admin updated successfully.');
      } else {
        await apiService.createAdmin(adminForm);
        setSuccess('Admin created successfully.');
      }
      resetAdminForm();
      await loadAdmins();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to save admin.');
    } finally {
      setAdminFormLoading(false);
    }
  };

  const handleToggleAdminStatus = async (adminUser) => {
    setError('');
    setSuccess('');
    const nextStatus = adminUser.account_status === 'active' ? 'suspended' : 'active';
    try {
      const result = await apiService.setAdminStatus(adminUser.id, nextStatus);
      setSuccess(result.message || `Admin ${nextStatus}.`);
      await loadAdmins();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to update admin status.');
    }
  };

  const handleDeleteAdmin = async (adminUser) => {
    setError('');
    setSuccess('');
    if (!window.confirm(`Delete admin account for ${adminUser.full_name}? This cannot be undone.`)) return;
    try {
      const result = await apiService.deleteAdmin(adminUser.id);
      setSuccess(result.message || 'Admin deleted.');
      if (editingAdminId === adminUser.id) resetAdminForm();
      await loadAdmins();
      await loadActivities();
    } catch (err) {
      setError(err.message || 'Failed to delete admin.');
    }
  };

  const openResetPasswordPanel = (adminUser) => {
    setError('');
    setSuccess('');
    setResetPasswordAdminId(adminUser.id);
    setResetPasswordValue('');
  };

  const submitResetPassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (resetPasswordValue.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setResetPasswordLoading(true);
    try {
      const result = await apiService.resetAdminPassword(resetPasswordAdminId, resetPasswordValue);
      setSuccess(result.message || 'Password reset successfully.');
      setResetPasswordAdminId(null);
      setResetPasswordValue('');
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setResetPasswordLoading(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  if (!admin) return <div>Loading admin...</div>;

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">AWC Admin Dashboard</div>
        <div className="nav-user">
          <span>Welcome, {admin.name}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <aside className="sidebar">
          <ul>
            {/* ── Dashboard ── */}
            <li className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}><span>Dashboard</span></li>
            {/* ── Operations ── */}
            <li className={activeTab === 'pickups' ? 'active' : ''} onClick={() => setActiveTab('pickups')}><span>Pickup Requests</span></li>
            <li className={activeTab === 'activities' ? 'active' : ''} onClick={() => setActiveTab('activities')}><span>Activity Log</span></li>
            <li className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}><span>Reports</span></li>
            {/* ── Fleet & Field ── */}
            <li className={activeTab === 'collectors' ? 'active' : ''} onClick={() => setActiveTab('collectors')}><span>Collectors</span></li>
            <li className={activeTab === 'manage-trucks' ? 'active' : ''} onClick={() => setActiveTab('manage-trucks')}><span>Trucks</span></li>
            {/* ── Config ── */}
            <li className={activeTab === 'manage-zones' ? 'active' : ''} onClick={() => setActiveTab('manage-zones')}><span>Zones</span></li>
            <li className={activeTab === 'billing' ? 'active' : ''} onClick={() => setActiveTab('billing')}><span>Billing</span></li>
            {/* ── Admin ── */}
            {(admin.role === 'admin' || admin.role === 'super_admin') && (
              <li className={activeTab === 'manage-admins' ? 'active' : ''} onClick={() => setActiveTab('manage-admins')}><span>Manage Admins</span></li>
            )}
          </ul>
        </aside>

        <main className="main-content">
          {loading && <p>Loading...</p>}
          {error && <p style={{ color: '#b00020' }}>{error}</p>}
          {success && <p style={{ color: '#0a7a3d' }}>{success}</p>}

          {activeTab === 'overview' && (
            <div className="overview">
              <h2>Overview</h2>
              <div className="stats-grid">
                <div className="stat-card"><h3>{dashboardStats.totalCollectors}</h3><p>Total Collectors</p></div>
                <div className="stat-card"><h3>{dashboardStats.availableCollectors}</h3><p>Available Collectors</p></div>
                <div className="stat-card"><h3>{dashboardStats.busyCollectors}</h3><p>Busy Collectors</p></div>
                <div className="stat-card"><h3>{dashboardStats.totalRequests}</h3><p>Total Pickup Requests</p></div>
                <div className="stat-card"><h3>{dashboardStats.completedRequests}</h3><p>Completed Requests</p></div>
                <div className="stat-card"><h3>{formatMoney(paymentSettings.rate_per_kg)}</h3><p>Rate Per Kg</p></div>
                <div className="stat-card"><h3>{formatMoney(dashboardStats.totalCharge)}</h3><p>Total Billable Value</p></div>
                <div className="stat-card"><h3>{formatMoney(dashboardStats.totalPaid)}</h3><p>Total Paid</p></div>
              </div>
            </div>
          )}

          {activeTab === 'collectors' && (
            <div className="collectors">
              <div className="admin-toolbar">
                <div>
                  <h2 style={{ marginBottom: '0.35rem' }}>Manage Collectors</h2>
                  <p className="admin-count">{collectors.length} active collectors</p>
                </div>
                <button type="button" className="admin-add-btn" onClick={openCreateCollectorForm}>
                  Register Collector
                </button>
              </div>

              {collectorFormOpen && (
                <div className="admin-card collector-admin-form-card" style={{ marginBottom: '1rem' }}>
                  <div className="collector-form-header">
                    <div>
                      <h3>{editingCollectorId ? 'Update Collector' : 'Register New Collector'}</h3>
                      <p>{editingCollectorId ? 'Edit collector identity, zone assignment, and access.' : 'Create a new collector account directly from the admin dashboard.'}</p>
                    </div>
                    <button type="button" className="modal-close" onClick={resetCollectorForm}>x</button>
                  </div>

                  <form className="collector-admin-form" onSubmit={submitCollectorForm}>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={collectorForm.full_name}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, full_name: event.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={collectorForm.email}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, email: event.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        value={collectorForm.phone}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, phone: event.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Employee Code</label>
                      <input
                        type="text"
                        placeholder="Leave blank to auto-generate"
                        value={collectorForm.employee_code}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, employee_code: event.target.value.toUpperCase() }))}
                      />
                    </div>

                    <div className="form-group collector-form-span-2">
                      <label>Address</label>
                      <input
                        type="text"
                        value={collectorForm.address_line}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, address_line: event.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Home Zone</label>
                      <select
                        value={collectorForm.home_zone_id}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, home_zone_id: event.target.value }))}
                        required
                      >
                        <option value="">Select Zone</option>
                        {zones.map((zone) => (
                          <option key={`home-${zone.id}`} value={zone.id}>{zone.zone_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Current Zone</label>
                      <select
                        value={collectorForm.current_zone_id}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, current_zone_id: event.target.value }))}
                        required
                      >
                        <option value="">Select Zone</option>
                        {zones.map((zone) => (
                          <option key={`current-${zone.id}`} value={zone.id}>{zone.zone_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Availability</label>
                      <select
                        value={collectorForm.availability_status}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, availability_status: event.target.value }))}
                      >
                        <option value="available">Available</option>
                        <option value="busy">Busy</option>
                        <option value="off_duty">Off Duty</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>{editingCollectorId ? 'New Password' : 'Password'}</label>
                      <input
                        type="password"
                        placeholder={editingCollectorId ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                        value={collectorForm.password}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, password: event.target.value }))}
                        required={!editingCollectorId}
                      />
                    </div>

                    <div className="form-group">
                      <label>{editingCollectorId ? 'Confirm New Password' : 'Confirm Password'}</label>
                      <input
                        type="password"
                        value={collectorForm.confirmPassword}
                        onChange={(event) => setCollectorForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                        required={!editingCollectorId || Boolean(collectorForm.password)}
                      />
                    </div>

                    <div className="collector-form-actions collector-form-span-2">
                      <button type="button" className="cancel-btn" onClick={resetCollectorForm}>Cancel</button>
                      <button type="submit" className="cta-button" disabled={collectorFormLoading}>
                        {collectorFormLoading ? 'Saving...' : editingCollectorId ? 'Save Changes' : 'Create Collector'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="table-scroll-wrap admin-table-wrap">
                <table className="pickup-table responsive-card-table admin-collectors-table">
                  <thead>
                    <tr>
                      <th>Employee Code</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Current Zone</th>
                      <th>Status</th>
                      <th>Total Assigned</th>
                      <th>Total Completed</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectors.map((collector) => (
                      <tr key={collector.collector_user_id}>
                        <td>{collector.employee_code}</td>
                        <td>{collector.full_name}</td>
                        <td>{collector.email}</td>
                        <td>{collector.current_zone}</td>
                        <td><span className={`status ${collector.availability_status}`}>{collector.availability_status}</span></td>
                        <td>{collector.total_assigned}</td>
                        <td>{collector.total_completed}</td>
                        <td>
                          <div className="action-btns collector-admin-actions">
                            <button className="edit-btn" type="button" onClick={() => openEditCollectorForm(collector)}>Edit</button>
                            <button className="edit-btn" onClick={() => changeCollectorAvailability(collector.collector_user_id, 'available')}>Available</button>
                            <button className="edit-btn" onClick={() => changeCollectorAvailability(collector.collector_user_id, 'busy')}>Busy</button>
                            <button className="delete-btn" onClick={() => changeCollectorAvailability(collector.collector_user_id, 'off_duty')}>Off Duty</button>
                            <button className="delete-btn" type="button" onClick={() => handleDeleteCollector(collector)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && collectors.length === 0 && (
                      <tr><td colSpan="8">No collectors found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'pickups' && (() => {
            const STATUS_OPTIONS = ['all', 'pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
            const STATUS_LABELS = { all: 'All', pending: 'Pending', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };

            const filteredRequests = pickupRequests.filter((req) => {
              const matchesStatus = pickupStatusFilter === 'all' || req.request_status === pickupStatusFilter;
              if (!matchesStatus) return false;
              if (!pickupSearchQuery.trim()) return true;
              const q = pickupSearchQuery.trim().toLowerCase();
              return (
                req.request_code?.toLowerCase().includes(q) ||
                req.resident_name?.toLowerCase().includes(q) ||
                req.zone_name?.toLowerCase().includes(q) ||
                req.waste_type?.toLowerCase().includes(q) ||
                req.pickup_address?.toLowerCase().includes(q)
              );
            });

            const statusCounts = pickupRequests.reduce((acc, req) => {
              acc[req.request_status] = (acc[req.request_status] || 0) + 1;
              acc.all = (acc.all || 0) + 1;
              return acc;
            }, {});

            return (
              <div className="admin-pickups-page">
                <div className="admin-toolbar">
                  <div>
                    <h2 style={{ marginBottom: '0.35rem' }}>Pickup Requests</h2>
                    <p className="admin-count">{filteredRequests.length} of {pickupRequests.length} request{pickupRequests.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    type="button"
                    className="admin-add-btn"
                    onClick={async () => { setLoading(true); await loadPickupRequests(); setLoading(false); }}
                  >
                    Refresh
                  </button>
                </div>

                {/* Status filter tabs */}
                <div className="pickup-filter-tabs">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`pickup-filter-tab${pickupStatusFilter === s ? ' active' : ''} pickup-filter-tab--${s}`}
                      onClick={() => setPickupStatusFilter(s)}
                    >
                      {STATUS_LABELS[s]}
                      {statusCounts[s] ? <span className="pickup-filter-count">{statusCounts[s]}</span> : null}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="pickup-search-bar">
                  <input
                    type="search"
                    placeholder="Search by code, resident, zone, waste type, address…"
                    value={pickupSearchQuery}
                    onChange={(e) => setPickupSearchQuery(e.target.value)}
                    className="pickup-search-input"
                  />
                </div>

                <div className="table-scroll-wrap admin-table-wrap">
                  <table className="pickup-table responsive-card-table admin-pickups-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Resident</th>
                        <th>Zone</th>
                        <th>Waste Type</th>
                        <th>Status</th>
                        <th>Est. Weight</th>
                        <th>Preferred Date</th>
                        <th>Requested</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((req) => {
                        const isExpanded = pickupExpandedId === req.id;
                        const isAssigning = pickupAssigningIds.has(req.id);
                        const isCancelling = pickupCancellingIds.has(req.id);
                        const canAssign = req.request_status === 'pending';
                        const canCancel = req.request_status === 'pending' || req.request_status === 'assigned' || req.request_status === 'in_progress';

                        return (
                          <>
                            <tr key={req.id} className={isExpanded ? 'pickup-row-expanded' : ''}>
                              <td>
                                <button
                                  type="button"
                                  className="pickup-code-toggle"
                                  onClick={() => setPickupExpandedId(isExpanded ? null : req.id)}
                                  title={isExpanded ? 'Collapse details' : 'Expand details'}
                                >
                                  <span className="pickup-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                                  {req.request_code}
                                </button>
                              </td>
                              <td>{req.resident_name || '—'}</td>
                              <td>{req.zone_name || '—'}</td>
                              <td style={{ textTransform: 'capitalize' }}>{req.waste_type || '—'}</td>
                              <td>
                                <span className={`request-status-badge ${req.request_status}`}>
                                  {STATUS_LABELS[req.request_status] || req.request_status}
                                </span>
                              </td>
                              <td>{req.estimated_weight_kg != null ? `${req.estimated_weight_kg} kg` : '—'}</td>
                              <td>{req.preferred_pickup_date ? new Date(req.preferred_pickup_date).toLocaleDateString() : '—'}</td>
                              <td>{req.requested_at ? new Date(req.requested_at).toLocaleString() : '—'}</td>
                              <td>
                                <div className="action-btns collector-admin-actions">
                                  {canAssign && (
                                    <button
                                      type="button"
                                      className="edit-btn"
                                      disabled={isAssigning}
                                      onClick={() => handleAssignNearest(req.id)}
                                    >
                                      {isAssigning ? 'Assigning…' : 'Assign Nearest'}
                                    </button>
                                  )}
                                  {canCancel && (
                                    <button
                                      type="button"
                                      className="delete-btn"
                                      disabled={isCancelling}
                                      onClick={() => handleCancelPickup(req)}
                                    >
                                      {isCancelling ? 'Cancelling…' : 'Cancel'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="edit-btn"
                                    onClick={() => setPickupExpandedId(isExpanded ? null : req.id)}
                                  >
                                    {isExpanded ? 'Hide' : 'Details'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${req.id}-detail`} className="pickup-detail-row">
                                <td colSpan="9">
                                  <div className="pickup-detail-panel">
                                    <div className="pickup-detail-grid">
                                      <div className="pickup-detail-section">
                                        <h4>Request Info</h4>
                                        <div className="pickup-detail-fields">
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Address</span><span>{req.pickup_address || '—'}</span></div>
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Notes</span><span>{req.notes || '—'}</span></div>
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Actual Weight</span><span>{req.actual_weight_kg != null ? `${req.actual_weight_kg} kg` : '—'}</span></div>
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Charged Amount</span><span>{req.charged_amount != null ? formatMoney(req.charged_amount, req.charge_currency || paymentSettings.currency) : '—'}</span></div>
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Completed At</span><span>{req.completed_at ? new Date(req.completed_at).toLocaleString() : '—'}</span></div>
                                        </div>
                                      </div>
                                      <div className="pickup-detail-section">
                                        <h4>Assignment</h4>
                                        <div className="pickup-detail-fields">
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Assignment Status</span><span style={{ textTransform: 'capitalize' }}>{req.latest_assignment_status || '—'}</span></div>
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Assigned Collector</span><span>{req.assigned_collector_user_id ? `User #${req.assigned_collector_user_id}` : '—'}</span></div>
                                          <div className="pickup-detail-field"><span className="pickup-detail-label">Assigned Truck</span><span>{req.assigned_truck_code || '—'}</span></div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                      {!loading && filteredRequests.length === 0 && (
                        <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No pickup requests found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {activeTab === 'activities' && (
            <div className="reports">
              <h2>System Activities</h2>
              <div className="table-scroll-wrap admin-table-wrap">
                <table className="pickup-table responsive-card-table admin-activities-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Actor</th>
                      <th>Request</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity) => (
                      <tr key={activity.id}>
                        <td>{new Date(activity.created_at).toLocaleString()}</td>
                        <td>{activity.activity_type}</td>
                        <td>{activity.actor_name || '-'}</td>
                        <td>{activity.request_code || '-'}</td>
                        <td>{activity.details}</td>
                      </tr>
                    ))}
                    {!loading && activities.length === 0 && (
                      <tr><td colSpan="5">No activities found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="reports">
              <h2>Reports</h2>

              <div className="admin-card" style={{ marginBottom: '1.2rem' }}>
                <h3>Completion Rates</h3>
                {completionRates ? (
                  <div className="profile-info">
                    <div className="info-group"><label>Total Requests:</label><span>{completionRates.total_requests}</span></div>
                    <div className="info-group"><label>Completed:</label><span>{completionRates.completed_requests}</span></div>
                    <div className="info-group"><label>Cancelled:</label><span>{completionRates.cancelled_requests}</span></div>
                    <div className="info-group"><label>Completion %:</label><span>{completionRates.completion_rate_percent}</span></div>
                  </div>
                ) : (
                  <p>No completion report available.</p>
                )}
              </div>

              <div className="admin-card" style={{ marginBottom: '1.2rem' }}>
                <h3>Pickups Per Zone</h3>
                <div className="table-scroll-wrap admin-table-wrap">
                  <table className="pickup-table responsive-card-table admin-zones-table">
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th>Total</th>
                        <th>Completed</th>
                        <th>Assigned</th>
                        <th>Pending</th>
                        <th>In Progress</th>
                        <th>Cancelled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickupsPerZone.map((row) => (
                        <tr key={row.zone_name}>
                          <td>{row.zone_name}</td>
                          <td>{row.total_requests}</td>
                          <td>{row.completed_requests}</td>
                          <td>{row.assigned_requests}</td>
                          <td>{row.pending_requests}</td>
                          <td>{row.in_progress_requests}</td>
                          <td>{row.cancelled_requests}</td>
                        </tr>
                      ))}
                      {!loading && pickupsPerZone.length === 0 && (
                        <tr><td colSpan="7">No zone report data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="admin-card">
                <h3>Collector Performance</h3>
                <div className="table-scroll-wrap admin-table-wrap">
                  <table className="pickup-table responsive-card-table admin-performance-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Zone</th>
                        <th>Assigned</th>
                        <th>Completed</th>
                        <th>Completion %</th>
                        <th>Rating</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectorPerformance.map((row) => (
                        <tr key={row.collector_user_id}>
                          <td>{row.full_name}</td>
                          <td>{row.current_zone}</td>
                          <td>{row.total_assigned}</td>
                          <td>{row.total_completed}</td>
                          <td>{row.completion_percent}</td>
                          <td>{row.average_rating}</td>
                          <td>{row.availability_status}</td>
                        </tr>
                      ))}
                      {!loading && collectorPerformance.length === 0 && (
                        <tr><td colSpan="7">No collector performance data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="admin-card" style={{ marginTop: '1.2rem' }}>
                <h3>Request Payment Ledger</h3>
                <div className="table-scroll-wrap admin-table-wrap">
                  <table className="pickup-table responsive-card-table admin-ledger-table">
                    <thead>
                      <tr>
                        <th>Request</th>
                        <th>Resident</th>
                        <th>Weight (kg)</th>
                        <th>Charge</th>
                        <th>Payment Status</th>
                        <th>Paid At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickupRequests.map((row) => {
                        const charge = apiService.calculatePickupCharge(row.estimated_weight_kg || 0);
                        const payment = apiService.getPaymentForRequest(row.id);

                        return (
                          <tr key={row.id}>
                            <td>{row.request_code}</td>
                            <td>{row.resident_name || '-'}</td>
                            <td>{row.estimated_weight_kg ?? '-'}</td>
                            <td>{formatMoney(charge.amount)}</td>
                            <td>{payment?.status === 'paid' ? 'Paid' : 'Pending'}</td>
                            <td>{payment?.paid_at ? new Date(payment.paid_at).toLocaleString() : '-'}</td>
                          </tr>
                        );
                      })}
                      {!loading && pickupRequests.length === 0 && (
                        <tr><td colSpan="6">No pickup request data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="reports">
              <h2>Billing Setup</h2>
              <div className="admin-card" style={{ maxWidth: '520px' }}>
                <form onSubmit={updateBillingSettings}>
                  <div className="form-group">
                    <label>Rate Per Kg</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={billingForm.rate_per_kg}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, rate_per_kg: event.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Currency</label>
                    <select
                      value={billingForm.currency}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, currency: event.target.value }))}
                    >
                      <option value="NGN">NGN</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>

                  <div className="admin-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                    <p style={{ margin: 0, color: '#666' }}>Current Active Rate</p>
                    <h3 style={{ margin: '0.4rem 0 0 0' }}>{formatMoney(paymentSettings.rate_per_kg)}</h3>
                    <p style={{ marginTop: '0.4rem', color: '#666' }}>This rate is applied to resident pickup charges by weight.</p>
                  </div>

                  <button type="submit" className="cta-button">Save Billing Rate</button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'manage-trucks' && (
            <div className="collectors">
              <div className="admin-toolbar">
                <div>
                  <h2 style={{ marginBottom: '0.35rem' }}>Trucks</h2>
                  <p className="admin-count">{trucks.length} truck{trucks.length !== 1 ? 's' : ''} registered</p>
                </div>
                <button type="button" className="admin-add-btn" onClick={openCreateTruckForm}>
                  Add Truck
                </button>
              </div>

              {truckFormOpen && (
                <div className="admin-card collector-admin-form-card" style={{ marginBottom: '1rem' }}>
                  <div className="collector-form-header">
                    <div>
                      <h3>{editingTruckId ? 'Edit Truck' : 'Register New Truck'}</h3>
                      <p>{editingTruckId ? 'Update truck details and assignment.' : 'Add a new truck to the fleet.'}</p>
                    </div>
                    <button type="button" className="modal-close" onClick={resetTruckForm}>x</button>
                  </div>

                  <form className="collector-admin-form" onSubmit={submitTruckForm}>
                    <div className="form-group">
                      <label>Truck Code</label>
                      <input
                        type="text"
                        placeholder="e.g. TRK-W2-01"
                        value={truckForm.truck_code}
                        onChange={(e) => setTruckForm((p) => ({ ...p, truck_code: e.target.value.toUpperCase() }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Plate Number</label>
                      <input
                        type="text"
                        placeholder="e.g. ABJ-521KD"
                        value={truckForm.plate_number}
                        onChange={(e) => setTruckForm((p) => ({ ...p, plate_number: e.target.value.toUpperCase() }))}
                        required
                      />
                    </div>

                    <div className="form-group collector-form-span-2">
                      <label>Model Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Iveco Eurocargo"
                        value={truckForm.model_name}
                        onChange={(e) => setTruckForm((p) => ({ ...p, model_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Capacity (kg)</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={truckForm.capacity_kg}
                        onChange={(e) => setTruckForm((p) => ({ ...p, capacity_kg: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Avg Speed (km/h)</label>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={truckForm.average_speed_kmh}
                        onChange={(e) => setTruckForm((p) => ({ ...p, average_speed_kmh: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Current Zone</label>
                      <select
                        value={truckForm.current_zone_id}
                        onChange={(e) => setTruckForm((p) => ({ ...p, current_zone_id: e.target.value }))}
                        required
                      >
                        <option value="">Select Zone</option>
                        {zones.filter((z) => z.is_active !== 0).map((zone) => (
                          <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={truckForm.truck_status}
                        onChange={(e) => setTruckForm((p) => ({ ...p, truck_status: e.target.value }))}
                      >
                        {TRUCK_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="collector-form-actions collector-form-span-2">
                      <button type="button" className="cancel-btn" onClick={resetTruckForm}>Cancel</button>
                      <button type="submit" className="cta-button" disabled={truckFormLoading}>
                        {truckFormLoading ? 'Saving...' : editingTruckId ? 'Save Changes' : 'Register Truck'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="table-scroll-wrap admin-table-wrap">
                <table className="pickup-table responsive-card-table admin-collectors-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Plate</th>
                      <th>Model</th>
                      <th>Capacity (kg)</th>
                      <th>Zone</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trucks.map((truck) => (
                      <tr key={truck.id}>
                        <td>{truck.truck_code}</td>
                        <td>{truck.plate_number}</td>
                        <td>{truck.model_name}</td>
                        <td>{truck.capacity_kg.toLocaleString()}</td>
                        <td>{truck.current_zone}</td>
                        <td>
                          <span className={`status ${truck.truck_status === 'available' ? 'available' : truck.truck_status === 'assigned' ? 'busy' : 'off_duty'}`}>
                            {truck.truck_status}
                          </span>
                        </td>
                        <td>
                          <div className="action-btns collector-admin-actions">
                            <button className="edit-btn" type="button" onClick={() => openEditTruckForm(truck)}>Edit</button>
                            {truck.truck_status !== 'available' && (
                              <button className="edit-btn" type="button" onClick={() => handleUpdateTruckStatus(truck, 'available')}>Available</button>
                            )}
                            {truck.truck_status !== 'maintenance' && (
                              <button className="edit-btn" type="button" onClick={() => handleUpdateTruckStatus(truck, 'maintenance')}>Maintenance</button>
                            )}
                            {truck.truck_status !== 'inactive' && (
                              <button className="delete-btn" type="button" onClick={() => handleUpdateTruckStatus(truck, 'inactive')}>Deactivate</button>
                            )}
                            <button className="delete-btn" type="button" onClick={() => handleDeleteTruck(truck)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && trucks.length === 0 && (
                      <tr><td colSpan="7">No trucks found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'manage-zones' && (
            <div className="collectors">
              <div className="admin-toolbar">
                <div>
                  <h2 style={{ marginBottom: '0.35rem' }}>Manage Zones</h2>
                  <p className="admin-count">{zones.length} zone{zones.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" className="admin-add-btn" onClick={openCreateZoneForm}>
                  Add Zone
                </button>
              </div>

              {zoneFormOpen && (
                <div className="admin-card collector-admin-form-card" style={{ marginBottom: '1rem' }}>
                  <div className="collector-form-header">
                    <div>
                      <h3>{editingZoneId ? 'Edit Zone' : 'Create New Zone'}</h3>
                      <p>{editingZoneId ? 'Update zone name and coordinates.' : 'Add a new service zone to the system.'}</p>
                    </div>
                    <button type="button" className="modal-close" onClick={resetZoneForm}>x</button>
                  </div>

                  <form className="collector-admin-form" onSubmit={submitZoneForm}>
                    <div className="form-group collector-form-span-2">
                      <label>Zone Name</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="e.g. Wuse II"
                          value={zoneForm.zone_name}
                          onChange={(e) => {
                            setZoneForm((prev) => ({ ...prev, zone_name: e.target.value }));
                            setZoneGeocodingError('');
                          }}
                          required
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={geocodeZoneName}
                          disabled={zoneGeocodingLoading || !zoneForm.zone_name.trim()}
                          className="cta-button"
                          style={{ whiteSpace: 'nowrap', padding: '0.55rem 0.9rem', fontSize: '0.85rem' }}
                          title="Auto-detect latitude & longitude from zone name"
                        >
                          {zoneGeocodingLoading ? '🔍 Detecting...' : '📍 Detect Coordinates'}
                        </button>
                      </div>
                      {zoneGeocodingError && (
                        <p style={{ color: '#e53935', fontSize: '0.82rem', marginTop: '0.3rem' }}>{zoneGeocodingError}</p>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        min="-90"
                        max="90"
                        placeholder="e.g. 9.076500"
                        value={zoneForm.latitude}
                        onChange={(e) => setZoneForm((prev) => ({ ...prev, latitude: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        min="-180"
                        max="180"
                        placeholder="e.g. 7.398600"
                        value={zoneForm.longitude}
                        onChange={(e) => setZoneForm((prev) => ({ ...prev, longitude: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="collector-form-actions collector-form-span-2">
                      <button type="button" className="cancel-btn" onClick={resetZoneForm}>Cancel</button>
                      <button type="submit" className="cta-button" disabled={zoneFormLoading}>
                        {zoneFormLoading ? 'Saving...' : editingZoneId ? 'Save Changes' : 'Create Zone'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="table-scroll-wrap admin-table-wrap">
                <table className="pickup-table responsive-card-table admin-collectors-table">
                  <thead>
                    <tr>
                      <th>Zone Name</th>
                      <th>Latitude</th>
                      <th>Longitude</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((zone) => (
                      <tr key={zone.id}>
                        <td>{zone.zone_name}</td>
                        <td>{Number(zone.latitude).toFixed(6)}</td>
                        <td>{Number(zone.longitude).toFixed(6)}</td>
                        <td>
                          <span className={`status ${zone.is_active ? 'available' : 'off_duty'}`}>
                            {zone.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>{new Date(zone.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="action-btns collector-admin-actions">
                            <button className="edit-btn" type="button" onClick={() => openEditZoneForm(zone)}>Edit</button>
                            <button
                              className={zone.is_active ? 'delete-btn' : 'edit-btn'}
                              type="button"
                              onClick={() => handleToggleZoneStatus(zone)}
                            >
                              {zone.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="delete-btn" type="button" onClick={() => handleDeleteZone(zone)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && zones.length === 0 && (
                      <tr><td colSpan="6">No zones found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'manage-admins' && (admin.role === 'admin' || admin.role === 'super_admin') && (
            <div className="collectors">
              <div className="admin-toolbar">
                <div>
                  <h2 style={{ marginBottom: '0.35rem' }}>Manage Admins</h2>
                  <p className="admin-count">{admins.length} admin account{admins.length !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" className="admin-add-btn" onClick={openCreateAdminForm}>
                  Add Admin
                </button>
              </div>

              {adminFormOpen && (
                <div className="admin-card collector-admin-form-card" style={{ marginBottom: '1rem' }}>
                  <div className="collector-form-header">
                    <div>
                      <h3>{editingAdminId ? 'Edit Admin Account' : 'Create New Admin'}</h3>
                      <p>{editingAdminId ? 'Update this admin\'s details.' : 'Create a new administrator account.'}</p>
                    </div>
                    <button type="button" className="modal-close" onClick={resetAdminForm}>x</button>
                  </div>

                  <form className="collector-admin-form" onSubmit={submitAdminForm}>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={adminForm.full_name}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, full_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        value={adminForm.phone}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, phone: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group collector-form-span-2">
                      <label>Address</label>
                      <input
                        type="text"
                        value={adminForm.address_line}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, address_line: e.target.value }))}
                        required
                      />
                    </div>

                    {!editingAdminId && (
                      <>
                        <div className="form-group">
                          <label>Password</label>
                          <input
                            type="password"
                            placeholder="Minimum 8 characters"
                            value={adminForm.password}
                            onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>Confirm Password</label>
                          <input
                            type="password"
                            value={adminForm.confirmPassword}
                            onChange={(e) => setAdminForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                            required
                          />
                        </div>
                      </>
                    )}

                    <div className="collector-form-actions collector-form-span-2">
                      <button type="button" className="cancel-btn" onClick={resetAdminForm}>Cancel</button>
                      <button type="submit" className="cta-button" disabled={adminFormLoading}>
                        {adminFormLoading ? 'Saving...' : editingAdminId ? 'Save Changes' : 'Create Admin'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {resetPasswordAdminId && (
                <div className="admin-card collector-admin-form-card" style={{ marginBottom: '1rem' }}>
                  <div className="collector-form-header">
                    <div>
                      <h3>Reset Admin Password</h3>
                      <p>Set a new password for this administrator.</p>
                    </div>
                    <button type="button" className="modal-close" onClick={() => { setResetPasswordAdminId(null); setResetPasswordValue(''); }}>x</button>
                  </div>
                  <form className="collector-admin-form" onSubmit={submitResetPassword}>
                    <div className="form-group collector-form-span-2">
                      <label>New Password</label>
                      <input
                        type="password"
                        placeholder="Minimum 8 characters"
                        value={resetPasswordValue}
                        onChange={(e) => setResetPasswordValue(e.target.value)}
                        required
                      />
                    </div>
                    <div className="collector-form-actions collector-form-span-2">
                      <button type="button" className="cancel-btn" onClick={() => { setResetPasswordAdminId(null); setResetPasswordValue(''); }}>Cancel</button>
                      <button type="submit" className="cta-button" disabled={resetPasswordLoading}>
                        {resetPasswordLoading ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="table-scroll-wrap admin-table-wrap">
                <table className="pickup-table responsive-card-table admin-collectors-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Address</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((adminUser) => (
                      <tr key={adminUser.id}>
                        <td>{adminUser.full_name}</td>
                        <td>{adminUser.email}</td>
                        <td>{adminUser.phone}</td>
                        <td>{adminUser.address_line}</td>
                        <td>
                          <span className={`status ${adminUser.account_status === 'active' ? 'available' : 'off_duty'}`}>
                            {adminUser.account_status}
                          </span>
                        </td>
                        <td>{new Date(adminUser.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="action-btns collector-admin-actions">
                            <button className="edit-btn" type="button" onClick={() => openEditAdminForm(adminUser)}>Edit</button>
                            <button className="edit-btn" type="button" onClick={() => openResetPasswordPanel(adminUser)}>Reset PW</button>
                            <button
                              className={adminUser.account_status === 'active' ? 'delete-btn' : 'edit-btn'}
                              type="button"
                              onClick={() => handleToggleAdminStatus(adminUser)}
                            >
                              {adminUser.account_status === 'active' ? 'Suspend' : 'Activate'}
                            </button>
                            <button className="delete-btn" type="button" onClick={() => handleDeleteAdmin(adminUser)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && admins.length === 0 && (
                      <tr><td colSpan="7">No admin accounts found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
