import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Circle, MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import apiService, { setZonesCache } from '../services/apiService';
import ResidentOverviewPanel from './resident/ResidentOverviewPanel';
import { useResidentDashboardData } from '../hooks/useResidentDashboardData';
import './Dashboard.css';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const userTrackingIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="font-size: 1.5rem; line-height: 1;">👤</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 24],
});

const truckTrackingIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="font-size: 1.5rem; line-height: 1;">🚚</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 24],
});

const pickupHouseIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="font-size: 1.5rem; line-height: 1;">🏠</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 24],
});

function formatMoney(amount, currency = 'NGN') {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
}

function UserDashboard() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentSettings, setPaymentSettings] = useState(apiService.getPaymentSettings());
  const [nearbyTrucks, setNearbyTrucks] = useState([]);
  const [truckSelectionOpen, setTruckSelectionOpen] = useState(false);
  const [pendingRequestPayload, setPendingRequestPayload] = useState(null);
  const [selectedTruckId, setSelectedTruckId] = useState('');
  const [activeTrackingRequestId, setActiveTrackingRequestId] = useState(null);
  const [liveTruckPoint, setLiveTruckPoint] = useState(null);
  const [zones, setZones] = useState([]);

  const [form, setForm] = useState({
    zone_id: '',
    pickup_address: '',
    waste_type: 'household',
    estimated_weight_kg: '',
    preferred_pickup_date: '',
    notes: '',
  });

  useEffect(() => {
    apiService.getZonesFromDB()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.zones || []);
        setZones(list);
        setZonesCache(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('awc_user');
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setForm((prev) => ({ ...prev, zone_id: parsed.zone_id ? String(parsed.zone_id) : '' }));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  const loadRequests = async () => {
    if (!user?.name) return;

    setLoading(true);
    setError('');
    try {
      const rows = await apiService.getPickupRequests();
      const mine = rows.filter((item) => item.resident_name === user.name);
      setRequests(mine);
    } catch (err) {
      setError(err.message || 'Failed to load pickup requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  useEffect(() => {
    if (!user?.name) return undefined;

    const timer = setInterval(() => {
      loadRequests();
    }, 15000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  const {
    summaryQuery,
    recentActivitiesQuery,
    monthlyStatsQuery,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    error: dashboardError,
  } = useResidentDashboardData(user?.id);

  const requestChargeMap = useMemo(() => {
    const mapped = {};
    requests.forEach((row) => {
      if (row.charged_amount !== null && row.charged_amount !== undefined) {
        mapped[row.id] = {
          amount: Number(row.charged_amount),
          currency: row.charge_currency || paymentSettings.currency,
        };
      } else {
        mapped[row.id] = apiService.calculatePickupCharge(row.estimated_weight_kg || 0);
      }
    });
    return mapped;
  }, [requests, paymentSettings.currency]);

  const requestWeightMap = useMemo(() => {
    const mapped = {};
    requests.forEach((row) => {
      mapped[row.id] = row.actual_weight_kg ?? row.estimated_weight_kg;
    });
    return mapped;
  }, [requests]);

  const estimatedCurrentCharge = useMemo(() => {
    return apiService.calculatePickupCharge(form.estimated_weight_kg || 0);
  }, [form.estimated_weight_kg, paymentSettings]);

  const createMapCenter = useMemo(() => {
    return apiService.resolvePickupPoint(form.zone_id, form.pickup_address);
  }, [form.zone_id, form.pickup_address]);

  const selectedTruck = nearbyTrucks.find((truck) => truck.truck_id === selectedTruckId) || null;

  const submitRequest = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!user?.id) {
      setError('Login session missing. Please login again.');
      return;
    }

    if (!form.zone_id || !form.pickup_address || !form.waste_type) {
      setError('zone, pickup address, and waste type are required.');
      return;
    }

    setLoading(true);
    try {
      const targetPoint = createMapCenter;
      let trucks = [];
      try {
        trucks = await apiService.getNearbyAvailableTrucks(form.zone_id, targetPoint, 8);
      } catch (apiErr) {
        const message = String(apiErr?.message || '').toLowerCase();
        if (message.includes('pickup request not found')) {
          trucks = apiService.getNearbyTrucksForPickup(form.zone_id, targetPoint, 8);
        } else {
          throw apiErr;
        }
      }

      // If the backend has no available trucks in the database, fall back to simulated
      // trucks so the resident can still place a request.
      if (!trucks.length) {
        trucks = apiService.getNearbyTrucksForPickup(form.zone_id, targetPoint, 8);
      }

      if (!trucks.length) {
        setError('No trucks could be found for this zone. Please try a different zone or contact support.');
        return;
      }

      setPendingRequestPayload({ ...form });
      setNearbyTrucks(trucks);
      setSelectedTruckId(trucks[0].truck_id);
      setTruckSelectionOpen(true);
    } catch (err) {
      setError(err.message || 'Failed to load nearby trucks.');
    } finally {
      setLoading(false);
    }
  };

  const confirmTruckAndCreateRequest = async () => {
    if (!user?.id || !pendingRequestPayload) return;

    const chosenTruck = nearbyTrucks.find((truck) => truck.truck_id === selectedTruckId);
    if (!chosenTruck) {
      setError('Please select a nearby truck option.');
      return;
    }

    setLoading(true);
    try {
      const requestDestination = apiService.resolvePickupPoint(
        pendingRequestPayload.zone_id,
        pendingRequestPayload.pickup_address,
      );

      const createResult = await apiService.createPickupRequest({
        resident_user_id: user.id,
        zone_id: Number(pendingRequestPayload.zone_id),
        pickup_address: pendingRequestPayload.pickup_address,
        pickup_latitude: requestDestination.lat,
        pickup_longitude: requestDestination.lng,
        waste_type: pendingRequestPayload.waste_type,
        estimated_weight_kg: pendingRequestPayload.estimated_weight_kg,
        preferred_pickup_date: pendingRequestPayload.preferred_pickup_date,
        notes: pendingRequestPayload.notes,
      });

      // Use direct-assign so the resident's chosen truck (and its driver) are
      // preferred. The backend falls back gracefully to any available collector/
      // truck when the selected ones are simulated or already busy.
      const isRealTruck = chosenTruck.truck_id && !String(chosenTruck.truck_id).startsWith('SIM-') && !String(chosenTruck.truck_id).startsWith('COL-');
      const preferredTruckId = isRealTruck ? chosenTruck.truck_id : null;
      const preferredCollectorId = chosenTruck.collector_user_id ?? null;

      await apiService.assignDirectTruckAndCollector(
        createResult.request_id,
        preferredTruckId,
        preferredCollectorId,
        `Resident selected ${chosenTruck.truck_code}; ETA ${chosenTruck.eta_minutes} mins.`,
      );

      setSuccess('Pickup request created. Truck option selected and assignment triggered.');

      setForm((prev) => ({
        ...prev,
        pickup_address: '',
        estimated_weight_kg: '',
        preferred_pickup_date: '',
        notes: '',
      }));

      setPendingRequestPayload(null);
      setNearbyTrucks([]);
      setSelectedTruckId('');
      setTruckSelectionOpen(false);

      await loadRequests();
      if (user?.id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['resident-dashboard-summary', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['resident-recent-activities', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['resident-monthly-stats', user.id] }),
        ]);
      }
      setActiveTab('requests');
    } catch (err) {
      setError(err.message || 'Failed to create pickup request.');
    } finally {
      setLoading(false);
    }
  };

  const trackedRequest = requests.find((row) => Number(row.id) === Number(activeTrackingRequestId)) || null;
  const trackedRequestDestination = (
    trackedRequest?.pickup_latitude !== null
    && trackedRequest?.pickup_latitude !== undefined
    && trackedRequest?.pickup_longitude !== null
    && trackedRequest?.pickup_longitude !== undefined
  )
    ? {
      lat: Number(trackedRequest.pickup_latitude),
      lng: Number(trackedRequest.pickup_longitude),
    }
    : null;
  const trackedDestination = trackedRequestDestination
    || apiService.resolvePickupPoint(trackedRequest?.zone_id || user?.zone_id, trackedRequest?.pickup_address || '');
  const trackedTruckCode = trackedRequest?.assigned_truck_code || null;
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
  const collectorArrived = trackedRequest?.request_status === 'in_progress';

  useEffect(() => {
    if (!activeTrackingRequestId || !trackedDestination) {
      setLiveTruckPoint(null);
      return;
    }

    if (trackedTruckStartPoint) {
      setLiveTruckPoint({ lat: trackedTruckStartPoint.lat, lng: trackedTruckStartPoint.lng });
      return;
    }

    const simulated = apiService.getNearbyTrucksForPickup(
      trackedRequest?.zone_id || user?.zone_id,
      trackedDestination,
      1,
    );

    if (!simulated.length) {
      setLiveTruckPoint(null);
      return;
    }

    setLiveTruckPoint({ lat: simulated[0].lat, lng: simulated[0].lng });
  }, [
    activeTrackingRequestId,
    trackedTruckStartPoint?.lat,
    trackedTruckStartPoint?.lng,
    trackedDestination?.lat,
    trackedDestination?.lng,
    trackedRequest?.zone_id,
    user?.zone_id,
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

  const handleLogout = () => {
    localStorage.removeItem('awc_user');
    window.location.href = '/';
  };

  if (!user) return <div>Loading user...</div>;

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">AWC Dashboard</div>
        <div className="nav-user">
          <span>Welcome, {user.name}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <aside className="sidebar">
          <ul>
            <li className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}><span>Overview</span></li>
            <li className={activeTab === 'create' ? 'active' : ''} onClick={() => setActiveTab('create')}><span>Request Pickup</span></li>
            <li className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}><span>My Requests</span></li>
            <li className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}><span>Profile</span></li>
          </ul>
        </aside>

        <main className="main-content">
          {activeTab === 'overview' && (
            <div className="overview">
              {isDashboardLoading ? <p>Loading dashboard overview...</p> : null}
              {isDashboardError ? <p className="form-alert-error">{dashboardError?.message || 'Failed to load dashboard overview.'}</p> : null}
              {!isDashboardLoading && !isDashboardError ? (
                <ResidentOverviewPanel
                  summary={summaryQuery.data || {}}
                  recentActivities={recentActivitiesQuery.data || []}
                  monthlyStats={monthlyStatsQuery.data || []}
                />
              ) : null}
            </div>
          )}

          {activeTab === 'create' && (
            <div className="schedule">
              <h2>Create Pickup Request</h2>
              <div className="schedule-live-layout user-create-layout">
                <div className="schedule-live-column">
                  <form className="schedule-form schedule-form-full pickup-form-card" onSubmit={submitRequest}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Zone</label>
                        <select value={form.zone_id} onChange={(e) => setForm((prev) => ({ ...prev, zone_id: e.target.value }))} required>
                          <option value="">Select Zone</option>
                          {zones.map((zone) => (
                            <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Waste Type</label>
                        <select value={form.waste_type} onChange={(e) => setForm((prev) => ({ ...prev, waste_type: e.target.value }))} required>
                          <option value="household">Household</option>
                          <option value="organic">Organic</option>
                          <option value="recyclable">Recyclable</option>
                          <option value="e_waste">E-Waste</option>
                          <option value="bulk">Bulk</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Pickup Address</label>
                      <input type="text" value={form.pickup_address} onChange={(e) => setForm((prev) => ({ ...prev, pickup_address: e.target.value }))} required />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Estimated Weight (kg)</label>
                        <input type="number" min="0" step="0.1" value={form.estimated_weight_kg} onChange={(e) => setForm((prev) => ({ ...prev, estimated_weight_kg: e.target.value }))} />
                      </div>

                      <div className="form-group">
                        <label>Preferred Pickup Date</label>
                        <input type="date" value={form.preferred_pickup_date} onChange={(e) => setForm((prev) => ({ ...prev, preferred_pickup_date: e.target.value }))} />
                      </div>
                    </div>

                    <div className="admin-card billing-estimate-card">
                      <h3 style={{ marginTop: 0, marginBottom: '0.4rem' }}>Estimated Payment</h3>
                      <p style={{ margin: 0 }}>
                        Rate: {formatMoney(paymentSettings.rate_per_kg, paymentSettings.currency)} / kg
                      </p>
                      <p style={{ marginTop: '0.4rem', marginBottom: 0, fontWeight: 700 }}>
                        Estimated charge: {formatMoney(estimatedCurrentCharge.amount, estimatedCurrentCharge.currency)}
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Notes</label>
                      <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
                    </div>

                    {error && <p className="form-alert-error">{error}</p>}
                    {success && <p className="form-alert-success">{success}</p>}

                    <button type="submit" className="cta-button pickup-submit-btn" disabled={loading}>
                      {loading ? 'Finding Trucks...' : 'Select Nearby Truck'}
                    </button>
                  </form>
                </div>

                <div className="schedule-live-column">
                  <div className="admin-card schedule-track-panel user-map-panel">
                    <h3 style={{ marginTop: 0 }}>Nearby Trucks and Live Map</h3>
                    <p style={{ marginTop: '0.4rem', color: '#666' }}>
                      Trucks and ETA are estimated based on your selected zone and pickup address.
                    </p>
                    <div className="map-container schedule-map-container user-map-surface" style={{ marginTop: '0.8rem' }}>
                      <MapContainer center={[createMapCenter.lat, createMapCenter.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                          attribution='&copy; OpenStreetMap contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[createMapCenter.lat, createMapCenter.lng]} icon={pickupHouseIcon}>
                          <Popup>Your pickup location</Popup>
                        </Marker>
                        <Circle center={[createMapCenter.lat, createMapCenter.lng]} radius={250} pathOptions={{ color: '#2e7d32' }} />
                        {nearbyTrucks.map((truck) => (
                          <Marker key={truck.truck_id} position={[truck.lat, truck.lng]} icon={truckTrackingIcon}>
                            <Popup>
                              <strong>{truck.truck_code}</strong><br />
                              Plate: {truck.plate_number}<br />
                              Model: {truck.model_name}<br />
                              Capacity: {truck.capacity_kg} kg<br />
                              Zone: {truck.current_zone}<br />
                              ETA: {truck.eta_minutes} mins<br />
                              Distance: {truck.distance_km} km<br />
                              <span style={{ color: '#555' }}>
                                {truck.collector_name ? `Collector: ${truck.collector_name}${truck.employee_code ? ` (${truck.employee_code})` : ''}` : 'Collector: Not currently assigned'}
                              </span>
                            </Popup>
                          </Marker>
                        ))}
                        {selectedTruck && (
                          <Polyline
                            positions={[
                              [selectedTruck.lat, selectedTruck.lng],
                              [createMapCenter.lat, createMapCenter.lng],
                            ]}
                            pathOptions={{ color: '#ff8f00' }}
                          />
                        )}
                      </MapContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="pickups">
              <h2>My Pickup Requests</h2>
              <div className="requests-live-layout user-requests-layout">
                <div className="schedule-live-column">
                  {loading && <p>Loading requests...</p>}
                  {error && <p className="form-alert-error">{error}</p>}
                  <div className="table-scroll-wrap user-requests-table-wrap">
                    <table className="pickup-table user-requests-table">
                      <thead>
                        <tr>
                          <th>Request Code</th>
                          <th>Zone</th>
                          <th>Waste Type</th>
                          <th>Weight (kg)</th>
                          <th>Charge</th>
                          <th>Payment</th>
                          <th>Address</th>
                          <th>Status</th>
                          <th>Requested At</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((row) => (
                          <tr key={row.id}>
                            <td>{row.request_code}</td>
                            <td>{row.zone_name}</td>
                            <td>{row.waste_type}</td>
                            <td>{requestWeightMap[row.id] ?? '-'}</td>
                            <td>{formatMoney(requestChargeMap[row.id]?.amount || 0, requestChargeMap[row.id]?.currency || paymentSettings.currency)}</td>
                            <td>{apiService.getPaymentForRequest(row.id)?.status === 'paid' ? 'Paid' : 'Pending'}</td>
                            <td>{row.pickup_address}</td>
                            <td><span className={`status request-status-badge ${row.request_status}`}>{row.request_status}</span></td>
                            <td>{new Date(row.requested_at).toLocaleString()}</td>
                            <td>
                              <div className="action-btns">
                                <button type="button" className="edit-btn" onClick={() => setActiveTrackingRequestId(row.id)}>
                                  Track
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!loading && requests.length === 0 && (
                          <tr><td colSpan="10">No pickup requests yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="schedule-live-column">
                  <div className="admin-card schedule-track-panel user-map-panel">
                    <h3 style={{ marginTop: 0 }}>Real-Time Pickup Tracking</h3>
                    <p style={{ marginTop: '0.5rem', color: '#666' }}>
                      {trackedRequest
                        ? `Request: ${trackedRequest.request_code}${trackedTruckCode ? ` | Truck: ${trackedTruckCode}` : ''}`
                        : 'Select a request and click Track to view its route.'}
                    </p>
                    {collectorArrived && (
                      <p className="form-alert-success" style={{ marginTop: '0.25rem' }}>
                        Collector has arrived at your pickup location.
                      </p>
                    )}
                    <div className="map-container schedule-map-container user-map-surface">
                      <MapContainer center={[trackedDestination.lat, trackedDestination.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                          attribution='&copy; OpenStreetMap contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[trackedDestination.lat, trackedDestination.lng]} icon={userTrackingIcon}>
                          <Popup>Your pickup location</Popup>
                        </Marker>
                        {liveTruckPoint && (
                          <Marker position={[liveTruckPoint.lat, liveTruckPoint.lng]} icon={truckTrackingIcon}>
                            <Popup>Waste collection truck</Popup>
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
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="profile">
              <h2>Profile</h2>
              <div className="profile-info">
                <div className="info-group"><label>Name:</label><span>{user.name}</span></div>
                <div className="info-group"><label>Email:</label><span>{user.email}</span></div>
                <div className="info-group"><label>Phone:</label><span>{user.phone || '-'}</span></div>
                <div className="info-group"><label>Role:</label><span>{user.role}</span></div>
                <div className="info-group"><label>Zone ID:</label><span>{user.zone_id || '-'}</span></div>
              </div>
            </div>
          )}
        </main>
      </div>

      {truckSelectionOpen && (
        <div className="tsm-overlay" onClick={() => setTruckSelectionOpen(false)}>
          <div className="tsm-modal" onClick={(e) => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className="tsm-header">
              <div className="tsm-header-left">
                <span className="tsm-header-icon">🚚</span>
                <div>
                  <h3 className="tsm-title">Select Nearby Truck</h3>
                  <p className="tsm-subtitle">{nearbyTrucks.length} truck{nearbyTrucks.length !== 1 ? 's' : ''} available · sorted by fastest arrival</p>
                </div>
              </div>
              <button className="tsm-close" onClick={() => setTruckSelectionOpen(false)}>✕</button>
            </div>

            {/* ── Cards list ── */}
            <div className="tsm-list">
              {nearbyTrucks.map((truck, index) => {
                const isSelected = selectedTruckId === truck.truck_id;
                const isFastest = index === 0;
                const etaTier = index === 0 ? 'fast' : index <= 2 ? 'mid' : 'slow';
                const rating = truck.average_rating ? Number(truck.average_rating).toFixed(1) : null;
                const ratingNum = rating ? Math.round(Number(rating)) : 0;
                const stars = rating
                  ? Array.from({ length: 5 }, (_, i) => i < ratingNum ? '★' : '☆').join('')
                  : null;

                return (
                  <div
                    key={truck.truck_id}
                    className={`tsm-card tsm-card--${etaTier}${isSelected ? ' tsm-card--selected' : ''}`}
                    onClick={() => setSelectedTruckId(truck.truck_id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedTruckId(truck.truck_id)}
                  >
                    {/* Row 1: radio + code + badges + ETA */}
                    <div className="tsm-card-header">
                      <div className="tsm-card-header-left">
                        <input
                          type="radio"
                          name="selected_truck"
                          value={truck.truck_id}
                          checked={isSelected}
                          onChange={() => setSelectedTruckId(truck.truck_id)}
                          className="tsm-radio"
                        />
                        <span className="tsm-truck-code">🚛 {truck.truck_code}</span>
                        {isFastest && <span className="tsm-badge tsm-badge--fastest">⚡ Fastest</span>}
                      </div>
                      <div className={`tsm-eta tsm-eta--${etaTier}`}>
                        <span className="tsm-eta-num">{truck.eta_minutes}</span>
                        <span className="tsm-eta-label">min</span>
                      </div>
                    </div>

                    {/* Arrival bar */}
                    <div className={`tsm-arrival-bar tsm-arrival-bar--${etaTier}`}>
                      🕐 Arrives in <strong>{truck.eta_minutes} min</strong> · {truck.distance_km} km away · {truck.average_speed_kmh || truck.speed_kmh} km/h
                    </div>

                    {/* Row 2: two-column detail sections */}
                    <div className="tsm-detail-grid">
                      {/* Truck info */}
                      <div className="tsm-detail-col">
                        <div className="tsm-col-heading">🚐 Truck</div>
                        <ul className="tsm-detail-list">
                          <li><span>Plate</span><strong>{truck.plate_number || '—'}</strong></li>
                          <li><span>Model</span><strong>{truck.model_name || '—'}</strong></li>
                          <li><span>Capacity</span><strong>{truck.capacity_kg ? `${truck.capacity_kg} kg` : '—'}</strong></li>
                          <li><span>Zone</span><strong>{truck.current_zone || '—'}</strong></li>
                        </ul>
                      </div>

                      {/* Driver info */}
                      <div className="tsm-detail-col">
                        <div className="tsm-col-heading">👤 Driver</div>
                        {truck.collector_name ? (
                          <ul className="tsm-detail-list">
                            <li><span>Name</span><strong>{truck.collector_name}</strong></li>
                            <li><span>ID</span><strong>{truck.employee_code || '—'}</strong></li>
                            {truck.collector_phone && <li><span>Phone</span><strong>{truck.collector_phone}</strong></li>}
                            <li><span>Pickups</span><strong>{truck.total_completed ?? '—'}</strong></li>
                            {rating && (
                              <li>
                                <span>Rating</span>
                                <strong>
                                  <span className="tsm-stars">{stars}</span> {rating}
                                </strong>
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p className="tsm-no-driver">No driver currently assigned</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Footer actions ── */}
            <div className="tsm-footer">
              <button className="tsm-btn-cancel" type="button" onClick={() => setTruckSelectionOpen(false)}>Cancel</button>
              <button className="tsm-btn-confirm cta-button" type="button" onClick={confirmTruckAndCreateRequest} disabled={loading}>
                {loading ? 'Submitting…' : 'Confirm & Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserDashboard;
