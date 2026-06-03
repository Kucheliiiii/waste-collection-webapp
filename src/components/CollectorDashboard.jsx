import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import apiService from '../services/apiService';
import ResidentMetricCard from './resident/ResidentMetricCard';
import './Dashboard.css';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const residentTrackingIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="font-size: 1.5rem; line-height: 1;">🏠</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 24],
});

const truckTrackingIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="font-size: 1.5rem; line-height: 1;">🚚</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 24],
});

function haversineDistanceKm(pointA, pointB) {
  if (!pointA || !pointB) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRad(pointB.lat - pointA.lat);
  const lonDelta = toRad(pointB.lng - pointA.lng);
  const lat1 = toRad(pointA.lat);
  const lat2 = toRad(pointB.lat);

  const a = Math.sin(latDelta / 2) ** 2
    + Math.sin(lonDelta / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function CollectorDashboard() {
  const navigate = useNavigate();
  const [collectorUser, setCollectorUser] = useState(null);
  const [collectorProfile, setCollectorProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [requests, setRequests] = useState([]);
  const [pickupRowsCache, setPickupRowsCache] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [noteByRequest, setNoteByRequest] = useState({});
  const [actualWeightByRequest, setActualWeightByRequest] = useState({});
  const [paymentVersion, setPaymentVersion] = useState(0);
  const [activeTrackingRequestId, setActiveTrackingRequestId] = useState(null);
  const [liveTruckPoint, setLiveTruckPoint] = useState(null);
  const [liveTruckSpeedKmh, setLiveTruckSpeedKmh] = useState(null);

  const formatMoney = (amount, currency = 'NGN') => {
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

  // SESSION GUARD — only collectors may access this dashboard
  useEffect(() => {
    const stored = localStorage.getItem('awc_user');

    if (!stored) {
      console.warn('[CollectorDashboard] No session found — redirecting to login');
      navigate('/login', { replace: true });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      console.warn('[CollectorDashboard] Malformed session — clearing and redirecting');
      localStorage.removeItem('awc_user');
      navigate('/login', { replace: true });
      return;
    }

    if (!parsed?.token || !parsed?.id) {
      console.warn('[CollectorDashboard] Session missing token or id — redirecting');
      localStorage.removeItem('awc_user');
      navigate('/login', { replace: true });
      return;
    }

    if (parsed.role !== 'collector') {
      console.warn(`[CollectorDashboard] Role "${parsed.role}" is not collector — redirecting`);
      navigate('/login', { replace: true });
      return;
    }

    console.log(`[CollectorDashboard] Session valid | collector id=${parsed.id} | email=${parsed.email}`);
    setCollectorUser(parsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    if (!collectorUser?.id) return;

    console.log(`[CollectorDashboard] Loading data for collector id=${collectorUser.id} (${collectorUser.email})`);
    setLoading(true);
    setError('');
    try {
      const [collectors, pickupRows] = await Promise.all([
        apiService.getCollectors(),
        apiService.getPickupRequests(),
      ]);
      setPickupRowsCache(pickupRows);

      const profile = collectors.find((item) => Number(item.collector_user_id) === Number(collectorUser.id));
      console.log(`[CollectorDashboard] Profile found:`, profile ? `${profile.full_name} (zone: ${profile.current_zone})` : 'NOT FOUND');
      setCollectorProfile(profile || null);

      if (!profile) {
        setRequests([]);
      } else {
        const scopedZoneRows = pickupRows.filter((row) => row.zone_name === profile.current_zone);
        const openRows = scopedZoneRows.filter((row) => ['assigned', 'in_progress'].includes(row.request_status));
        setRequests(openRows);
      }
    } catch (err) {
      setError(err.message || 'Failed to load collector dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectorUser?.id]);

  useEffect(() => {
    if (!collectorUser?.id) return undefined;

    const timer = setInterval(() => {
      loadData();
    }, 15000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectorUser?.id]);

  const overviewStats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    const day = startOfWeek.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);

    const isSameOrAfter = (value, boundary) => {
      if (!value) return false;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed >= boundary;
    };

    const collectorRows = pickupRowsCache.filter(
      (row) => Number(row.assigned_collector_user_id) === Number(collectorUser?.id)
    );

    const isTodayDate = (value) => {
      if (!value) return false;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed >= startOfToday;
    };

    const todayRows = collectorRows.filter((row) => (
      isTodayDate(row.preferred_pickup_date)
      || isTodayDate(row.requested_at)
      || isTodayDate(row.completed_at)
    ));
    const todayTotal = todayRows.length;
    const todayCompleted = todayRows.filter(
      (row) => row.request_status === 'completed' && isTodayDate(row.completed_at)
    ).length;

    const pending = collectorRows.filter((row) => row.request_status === 'assigned').length;
    const inProgress = collectorRows.filter((row) => row.request_status === 'in_progress').length;
    const remaining = pending + inProgress;

    const completedThisWeek = collectorRows.filter((row) => (
      row.request_status === 'completed' && isSameOrAfter(row.completed_at || row.requested_at, startOfWeek)
    ));

    const onTimeCompleted = completedThisWeek.filter((row) => {
      if (!row.preferred_pickup_date || !row.completed_at) return false;
      const targetDate = new Date(row.preferred_pickup_date);
      targetDate.setHours(23, 59, 59, 999);
      const completedDate = new Date(row.completed_at);
      return completedDate <= targetDate;
    }).length;

    const onTimeRate = completedThisWeek.length > 0
      ? (onTimeCompleted / completedThisWeek.length) * 100
      : 0;

    const rating = Number(collectorProfile?.average_rating || 0);

    const totalMoneyPaid = collectorRows.reduce((sum, row) => {
      if (row.request_status !== 'completed') return sum;
      return sum + Number(row.charged_amount || 0);
    }, 0);

    // ── Eco-points ──────────────────────────────────────────────────────────
    // 10 pts per completed pickup + 2 pts per kg of actual/estimated waste
    const completedRows = collectorRows.filter((row) => row.request_status === 'completed');
    const totalWasteKg = completedRows.reduce((sum, row) => {
      return sum + Number(row.actual_weight_kg ?? row.estimated_weight_kg ?? 0);
    }, 0);
    const ecoPoints = Math.round(completedRows.length * 10 + totalWasteKg * 2);

    // Tier thresholds
    const ecoTiers = [
      { label: 'Seedling',       min: 0,     max: 499,   color: '#84cc16', next: 500 },
      { label: 'Sapling',        min: 500,   max: 1499,  color: '#22c55e', next: 1500 },
      { label: 'Tree',           min: 1500,  max: 2999,  color: '#16a34a', next: 3000 },
      { label: 'Forest Guardian',min: 3000,  max: Infinity, color: '#14532d', next: null },
    ];
    const currentTier = ecoTiers.find((t) => ecoPoints >= t.min && ecoPoints <= t.max) || ecoTiers[0];
    const pointsToNextTier = currentTier.next != null ? Math.max(0, currentTier.next - ecoPoints) : 0;
    const tierProgress = currentTier.next != null
      ? Math.min(100, ((ecoPoints - currentTier.min) / (currentTier.next - currentTier.min)) * 100)
      : 100;
    // ────────────────────────────────────────────────────────────────────────

    return {
      todayCompleted,
      todayTotal,
      pending,
      inProgress,
      remaining,
      onTimeRate,
      rating,
      totalMoneyPaid,
      ecoPoints,
      currentTier,
      pointsToNextTier,
      tierProgress,
    };
  }, [pickupRowsCache, collectorUser?.id, collectorProfile?.average_rating, paymentVersion]);

  const trackedRequest = requests.find((row) => Number(row.id) === Number(activeTrackingRequestId)) || null;
  const trackedZoneId = apiService.mapZoneNameToId(trackedRequest?.zone_name) || collectorUser?.zone_id;
  const trackedDestination = (
    trackedRequest?.pickup_latitude !== null
    && trackedRequest?.pickup_latitude !== undefined
    && trackedRequest?.pickup_longitude !== null
    && trackedRequest?.pickup_longitude !== undefined
  )
    ? {
      lat: Number(trackedRequest.pickup_latitude),
      lng: Number(trackedRequest.pickup_longitude),
    }
    : apiService.resolvePickupPoint(trackedZoneId, trackedRequest?.pickup_address || '');
  const trackedTruckCode = trackedRequest?.assigned_truck_code || null;
  const assignedTruckSpeed = trackedRequest?.assigned_truck_speed_kmh !== null && trackedRequest?.assigned_truck_speed_kmh !== undefined
    ? Number(trackedRequest.assigned_truck_speed_kmh)
    : null;
  const trackedTruckStartPoint = (
    trackedRequest?.assigned_truck_latitude !== null
    && trackedRequest?.assigned_truck_latitude !== undefined
    && trackedRequest?.assigned_truck_longitude !== null
    && trackedRequest?.assigned_truck_longitude !== undefined
  )
    ? {
      lat: Number(trackedRequest.assigned_truck_latitude),
      lng: Number(trackedRequest.assigned_truck_longitude),
    }
    : null;
  const trackingMetrics = useMemo(() => {
    if (!liveTruckPoint || !trackedDestination) {
      return {
        distanceKm: null,
        etaMinutes: null,
        speedKmh: null,
      };
    }

    const distanceKm = haversineDistanceKm(liveTruckPoint, trackedDestination);
    const speedKmPerHour = liveTruckSpeedKmh && liveTruckSpeedKmh > 0 ? liveTruckSpeedKmh : 28;
    const etaMinutes = Math.max(1, Math.round((distanceKm / speedKmPerHour) * 60));

    return {
      distanceKm: Number(distanceKm.toFixed(2)),
      etaMinutes,
      speedKmh: Number(speedKmPerHour.toFixed(1)),
    };
  }, [liveTruckPoint, trackedDestination, liveTruckSpeedKmh]);

  useEffect(() => {
    if (!activeTrackingRequestId || !trackedDestination) {
      setLiveTruckPoint(null);
      setLiveTruckSpeedKmh(null);
      return;
    }

    if (trackedTruckStartPoint) {
      setLiveTruckPoint({ lat: trackedTruckStartPoint.lat, lng: trackedTruckStartPoint.lng });
      setLiveTruckSpeedKmh(assignedTruckSpeed);
      return;
    }

    const simulated = apiService.getNearbyTrucksForPickup(trackedZoneId, trackedDestination, 1);
    if (!simulated.length) {
      setLiveTruckPoint(null);
      setLiveTruckSpeedKmh(null);
      return;
    }

    setLiveTruckPoint({ lat: simulated[0].lat, lng: simulated[0].lng });
    setLiveTruckSpeedKmh(Number(simulated[0].speed_kmh || 0) || null);
  }, [
    activeTrackingRequestId,
    assignedTruckSpeed,
    trackedTruckStartPoint?.lat,
    trackedTruckStartPoint?.lng,
    trackedDestination?.lat,
    trackedDestination?.lng,
    trackedZoneId,
  ]);

  useEffect(() => {
    if (!activeTrackingRequestId || !trackedDestination) return;

    const timer = setInterval(() => {
      setLiveTruckPoint((current) => {
        if (!current) return current;
        return apiService.simulateTruckMovement(current, trackedDestination, 0.09);
      });
    }, 2500);

    return () => clearInterval(timer);
  }, [activeTrackingRequestId, trackedDestination?.lat, trackedDestination?.lng]);

  const confirmPickup = async (requestId) => {
    if (!collectorUser?.id) return;
    setError('');
    setSuccess('');

    const request = requests.find((row) => Number(row.id) === Number(requestId));
    const enteredWeight = actualWeightByRequest[requestId];
    const hasActualWeight = enteredWeight !== undefined && String(enteredWeight).trim() !== '';
    const pickupWeight = hasActualWeight ? Number(enteredWeight) : Number(request?.estimated_weight_kg || 0);

    if (hasActualWeight && (Number.isNaN(pickupWeight) || pickupWeight < 0)) {
      setError('Actual weight must be a valid non-negative number.');
      return;
    }

    const charge = apiService.calculatePickupCharge(pickupWeight);

    try {
      await apiService.confirmPickup(
        requestId,
        collectorUser.id,
        noteByRequest[requestId] || null,
        pickupWeight,
        charge.amount,
        charge.currency,
      );
      setSuccess(`Pickup request #${requestId} confirmed successfully.`);
      setActualWeightByRequest((prev) => ({ ...prev, [requestId]: '' }));
      await loadData();
      setPaymentVersion((prev) => prev + 1);
    } catch (err) {
      setError(err.message || 'Failed to confirm pickup.');
    }
  };

  const getDisplayWeight = (row) => {
    if (row.actual_weight_kg !== null && row.actual_weight_kg !== undefined) {
      return Number(row.actual_weight_kg);
    }
    return row.estimated_weight_kg;
  };

  const getDisplayCharge = (row) => {
    if (row.charged_amount !== null && row.charged_amount !== undefined) {
      return {
        amount: Number(row.charged_amount),
        currency: row.charge_currency || 'NGN',
      };
    }
    const fallback = apiService.calculatePickupCharge(getDisplayWeight(row) || 0);
    return {
      amount: fallback.amount,
      currency: fallback.currency,
    };
  };

  const markArrived = async (requestId) => {
    if (!collectorUser?.id) return;
    setError('');
    setSuccess('');

    try {
      await apiService.markCollectorArrived(requestId, collectorUser.id, noteByRequest[requestId] || null);
      setSuccess(`Arrival update sent for request #${requestId}. User has been notified.`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to mark collector arrival.');
    }
  };

  const markAsPaid = (requestId) => {
    const request = requests.find((row) => Number(row.id) === Number(requestId));
    const enteredWeight = actualWeightByRequest[requestId];
    const hasEnteredWeight = enteredWeight !== undefined && String(enteredWeight).trim() !== '';
    const weightForCharge = hasEnteredWeight
      ? Number(enteredWeight)
      : Number(request?.actual_weight_kg ?? request?.estimated_weight_kg ?? 0);
    const charge = apiService.calculatePickupCharge(weightForCharge);
    apiService.markRequestPayment(requestId, charge.amount, charge.currency, 'paid', collectorUser?.name || 'Collector');
    setPaymentVersion((prev) => prev + 1);
    setSuccess(`Request #${requestId} payment updated to paid.`);
  };

  const updateAvailability = async (status) => {
    if (!collectorUser?.id) return;
    setError('');
    setSuccess('');

    try {
      await apiService.updateCollectorAvailability(collectorUser.id, status, collectorUser.id);
      setSuccess(`Availability updated to ${status}.`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to update availability.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('awc_user');
    window.location.href = '/';
  };

  if (!collectorUser) return <div>Loading collector...</div>;

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">AWC Collector Dashboard</div>
        <div className="nav-user">
          <span>Welcome, {collectorUser.name}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <aside className="sidebar">
          <ul>
            <li className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}><span>Overview</span></li>
            <li className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}><span>Assigned Requests</span></li>
            <li className={activeTab === 'tracking' ? 'active' : ''} onClick={() => setActiveTab('tracking')}><span>Resident Location Tracking</span></li>
            <li className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}><span>Profile</span></li>
          </ul>
        </aside>

        <main className="main-content">
          {error && <p style={{ color: '#b00020' }}>{error}</p>}
          {success && <p style={{ color: '#0a7a3d' }}>{success}</p>}

          {activeTab === 'overview' && (
            <div className="overview">
              <h2>Overview</h2>
              <div className="stats-grid">
                <ResidentMetricCard
                  title="Today's Pickups"
                  value={overviewStats.todayCompleted}
                  subtitle="Completed"
                  breakdown={[
                    { name: 'Completed', value: overviewStats.todayCompleted },
                    { name: 'Remaining', value: Math.max(0, overviewStats.todayTotal - overviewStats.todayCompleted) },
                  ]}
                  colors={['#0d9488', '#d4d4d4']}
                  formatter={(next) => `${Math.round(next)}/${overviewStats.todayTotal}`}
                />
                <ResidentMetricCard
                  title="Remaining"
                  value={overviewStats.remaining}
                  subtitle="Pending / In Progress"
                  breakdown={[
                    { name: 'Pending', value: overviewStats.pending },
                    { name: 'In Progress', value: overviewStats.inProgress },
                    { name: 'Other', value: Math.max(0, overviewStats.todayTotal - overviewStats.remaining) },
                  ]}
                  colors={['#f97316', '#5b6bc0', '#d4d4d4']}
                />
                <ResidentMetricCard
                  title="On-Time Rate"
                  value={overviewStats.onTimeRate}
                  subtitle="This Week"
                  breakdown={[
                    { name: 'On-Time', value: overviewStats.onTimeRate },
                    { name: 'Late', value: Math.max(0, 100 - overviewStats.onTimeRate) },
                  ]}
                  colors={['#2ea89d', '#d4d4d4']}
                  formatter={(next) => `${next.toFixed(1)}%`}
                />
                <ResidentMetricCard
                  title="Rating"
                  value={overviewStats.rating}
                  subtitle="of 5.0"
                  breakdown={[
                    { name: 'Rating', value: overviewStats.rating },
                    { name: 'Remaining', value: Math.max(0, 5 - overviewStats.rating) },
                  ]}
                  colors={['#f97316', '#d4d4d4']}
                  formatter={(next) => `★ ${next.toFixed(1)}`}
                />
                <div className="stat-card">
                  <h3>{formatMoney(overviewStats.totalMoneyPaid)}</h3>
                  <p>Total Money Paid</p>
                </div>

                {/* Eco-points card */}
                <div className="eco-points-card stat-card">
                  <div className="eco-points-header">
                    <span className="eco-points-icon">🌱</span>
                    <div>
                      <h3 className="eco-points-value">{overviewStats.ecoPoints.toLocaleString()}</h3>
                      <p className="eco-points-label">Eco Points</p>
                    </div>
                  </div>
                  <div
                    className="eco-tier-badge"
                    style={{ background: overviewStats.currentTier.color }}
                  >
                    {overviewStats.currentTier.label}
                  </div>
                  <div className="eco-progress-wrap">
                    <div className="eco-progress-bar">
                      <div
                        className="eco-progress-fill"
                        style={{
                          width: `${overviewStats.tierProgress}%`,
                          background: overviewStats.currentTier.color,
                        }}
                      />
                    </div>
                    <p className="eco-progress-caption">
                      {overviewStats.pointsToNextTier > 0
                        ? `${overviewStats.pointsToNextTier.toLocaleString()} pts to next tier`
                        : 'Max tier reached!'}
                    </p>
                  </div>
                  <p className="eco-points-tip">+10 pts per pickup · +2 pts per kg collected</p>
                </div>
              </div>

              <div className="admin-card" style={{ marginTop: '1rem' }}>
                <h3>Availability</h3>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button className="cta-button" type="button" onClick={() => updateAvailability('available')}>Set Available</button>
                  <button className="edit-btn" type="button" onClick={() => updateAvailability('busy')}>Set Busy</button>
                  <button className="delete-btn" type="button" onClick={() => updateAvailability('off_duty')}>Set Off Duty</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="pickups">
              <h2>Assigned Requests</h2>
              {loading && <p>Loading requests...</p>}
              <div className="table-scroll-wrap collector-table-wrap">
                <table className="pickup-table collector-requests-table responsive-card-table collector-card-table">
                  <thead>
                    <tr>
                      <th>Request Code</th>
                      <th>Resident</th>
                      <th>Zone</th>
                      <th>Weight (kg)</th>
                      <th>Actual Weight (kg)</th>
                      <th>Charge</th>
                      <th>Payment</th>
                      <th>Address</th>
                      <th>Status</th>
                      <th>Note</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((row) => (
                      <tr key={row.id}>
                        <td>{row.request_code}</td>
                        <td>{row.resident_name}</td>
                        <td>{row.zone_name}</td>
                        <td>{getDisplayWeight(row) ?? '-'}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="Enter actual"
                            value={actualWeightByRequest[row.id] ?? ''}
                            onChange={(e) => setActualWeightByRequest((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          />
                        </td>
                        <td>{formatMoney(getDisplayCharge(row).amount, getDisplayCharge(row).currency)}</td>
                        <td>{apiService.getPaymentForRequest(row.id)?.status === 'paid' ? 'Paid' : 'Pending'}</td>
                        <td>{row.pickup_address}</td>
                        <td><span className={`status request-status-badge ${row.request_status}`}>{row.request_status}</span></td>
                        <td>
                          <input
                            type="text"
                            placeholder="Completion note"
                            value={noteByRequest[row.id] || ''}
                            onChange={(e) => setNoteByRequest((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          />
                        </td>
                        <td>
                          <div className="action-btns">
                            <button className="edit-btn" type="button" onClick={() => {
                              setActiveTrackingRequestId(row.id);
                              setActiveTab('tracking');
                            }}>
                              Track
                            </button>
                            {row.request_status !== 'in_progress' && (
                              <button className="edit-btn" type="button" onClick={() => markArrived(row.id)}>
                                Mark Arrived
                              </button>
                            )}
                            {apiService.getPaymentForRequest(row.id)?.status === 'paid' ? (
                              <button className="cta-button" type="button" disabled>Paid</button>
                            ) : (
                              <button className="cta-button" type="button" onClick={() => markAsPaid(row.id)}>
                                Mark Paid
                              </button>
                            )}
                            <button className="cta-button" type="button" onClick={() => confirmPickup(row.id)}>
                              Confirm Pickup
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && requests.length === 0 && (
                      <tr><td colSpan="11">No active assigned requests found in your zone.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="pickups">
              <h2>Resident Location Tracking</h2>
              <div className="admin-card" style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontWeight: 600 }}>Track Request</label>
                <select
                  style={{ marginTop: '0.4rem', width: '100%', padding: '0.6rem' }}
                  value={activeTrackingRequestId || ''}
                  onChange={(e) => setActiveTrackingRequestId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select request</option>
                  {requests.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.request_code} - {row.resident_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-card schedule-track-panel user-map-panel">
                <p style={{ marginTop: 0, color: '#666' }}>
                  {trackedRequest
                    ? `Request: ${trackedRequest.request_code}${trackedTruckCode ? ` | Truck: ${trackedTruckCode}` : ''}`
                    : 'Select a request to track resident pickup location.'}
                </p>
                {trackedRequest && (
                  <div className="admin-card" style={{ marginBottom: '0.75rem', background: '#f9fbff' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      Distance: {trackingMetrics.distanceKm !== null ? `${trackingMetrics.distanceKm} km` : 'N/A'}
                    </p>
                    <p style={{ margin: '0.35rem 0 0 0' }}>
                      ETA: {trackingMetrics.etaMinutes !== null ? `${trackingMetrics.etaMinutes} mins` : 'N/A'}
                    </p>
                    <p style={{ margin: '0.35rem 0 0 0' }}>
                      Speed: {trackingMetrics.speedKmh !== null ? `${trackingMetrics.speedKmh} km/h` : 'N/A'}
                    </p>
                  </div>
                )}
                <div className="map-container schedule-map-container user-map-surface">
                  <MapContainer center={[trackedDestination.lat, trackedDestination.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[trackedDestination.lat, trackedDestination.lng]} icon={residentTrackingIcon}>
                      <Popup>Resident pickup location</Popup>
                    </Marker>
                    {liveTruckPoint && (
                      <Marker position={[liveTruckPoint.lat, liveTruckPoint.lng]} icon={truckTrackingIcon}>
                        <Popup>Assigned truck location</Popup>
                      </Marker>
                    )}
                    {liveTruckPoint && (
                      <Polyline
                        positions={[
                          [liveTruckPoint.lat, liveTruckPoint.lng],
                          [trackedDestination.lat, trackedDestination.lng],
                        ]}
                        pathOptions={{ color: '#1976d2' }}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="profile">
              <h2>Collector Profile</h2>
              <div className="profile-info">
                <div className="info-group"><label>Name:</label><span>{collectorUser.name}</span></div>
                <div className="info-group"><label>Email:</label><span>{collectorUser.email}</span></div>
                <div className="info-group"><label>Phone:</label><span>{collectorUser.phone || '-'}</span></div>
                <div className="info-group"><label>Role:</label><span>{collectorUser.role}</span></div>
                <div className="info-group"><label>Employee Code:</label><span>{collectorProfile?.employee_code || '-'}</span></div>
                <div className="info-group"><label>Current Zone:</label><span>{collectorProfile?.current_zone || '-'}</span></div>
                <div className="info-group"><label>Availability:</label><span>{collectorProfile?.availability_status || '-'}</span></div>
                <div className="info-group"><label>Total Assigned:</label><span>{collectorProfile?.total_assigned ?? '-'}</span></div>
                <div className="info-group"><label>Total Completed:</label><span>{collectorProfile?.total_completed ?? '-'}</span></div>
                <div className="info-group">
                  <label>Eco Points:</label>
                  <span>
                    {overviewStats.ecoPoints.toLocaleString()}
                    {' '}
                    <span
                      className="eco-tier-badge"
                      style={{ background: overviewStats.currentTier.color, marginLeft: '0.4rem', verticalAlign: 'middle' }}
                    >
                      {overviewStats.currentTier.label}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default CollectorDashboard;
