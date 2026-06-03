function buildApiBaseUrl(rawBase) {
  const fallback = 'http://localhost:5000/api';
  const candidate = String(rawBase || '').trim();
  if (!candidate) return fallback;

  const normalized = candidate.replace(/\/+$/, '');
  if (normalized.endsWith('/api')) return normalized;
  return `${normalized}/api`;
}

const BASE_URL = buildApiBaseUrl(import.meta.env.VITE_API_URL);

// Zones are loaded from the database at runtime. Call setZonesCache() after fetching.
let _zonesCache = [];
export function setZonesCache(zones) {
  _zonesCache = Array.isArray(zones) ? zones : [];
}
export function getZonesList() {
  return _zonesCache;
}

const PAYMENT_SETTINGS_KEY = 'awc_payment_settings';
const PAYMENT_RECORDS_KEY = 'awc_payment_records';

const DEFAULT_PAYMENT_SETTINGS = {
  rate_per_kg: 120,
  currency: 'NGN',
};

function readJsonStorage(key, fallbackValue) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallbackValue;
  try {
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function haversineDistanceKm(pointA, pointB) {
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

function getZoneCenter(zoneId) {
  const zone = _zonesCache.find((item) => Number(item.id) === Number(zoneId));
  if (!zone) return { lat: 9.0765, lng: 7.3986 };
  return { lat: Number(zone.latitude), lng: Number(zone.longitude) };
}

function formatCollectorDetail(collector) {
  const employeeCode = collector?.employee_code || 'N/A';
  const completed = Number(collector?.total_completed || 0);
  return `${employeeCode} | Completed pickups: ${completed}`;
}

function hashString(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return 0;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function resolvePickupPoint(zoneId, pickupAddress) {
  const center = getZoneCenter(zoneId);
  const addressHash = hashString(pickupAddress);
  if (!addressHash) return center;

  // Deterministic offset keeps requests in the selected zone while varying by address.
  const latSeed = (addressHash % 1000) / 1000;
  const lngSeed = (Math.floor(addressHash / 1000) % 1000) / 1000;
  const latOffset = (latSeed - 0.5) * 0.03;
  const lngOffset = (lngSeed - 0.5) * 0.03;

  return {
    lat: center.lat + latOffset,
    lng: center.lng + lngOffset,
  };
}

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  const stored = localStorage.getItem('awc_user');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.token) {
        options.headers.Authorization = `Bearer ${parsed.token}`;
      }
    } catch {
      // ignore malformed cache
    }
  }

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path, body) => request('DELETE', path, body);

function mapZoneNameToId(zoneName) {
  const normalized = String(zoneName || '').trim().toLowerCase();
  const found = _zonesCache.find((zone) => zone.zone_name.toLowerCase() === normalized);
  return found ? found.id : null;
}

export const apiService = {
  mapZoneNameToId,
  resolvePickupPoint,

  async healthCheck() {
    return get('/health');
  },

  async login(email, password) {
    return post('/auth/login', {
      email: String(email || '').trim(),
      password: String(password || ''),
    });
  },

  async register(formData) {
    const payload = {
      full_name: formData.full_name,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      address_line: formData.address_line,
      zone_id: Number(formData.zone_id),
    };
    return post('/auth/register', payload);
  },

  async forgotPassword(email) {
    return post('/auth/forgot-password', {
      email: String(email || '').trim().toLowerCase(),
    });
  },

  async resetPassword(email, resetCode, newPassword) {
    return post('/auth/reset-password', {
      email: String(email || '').trim().toLowerCase(),
      reset_code: String(resetCode || '').trim(),
      new_password: String(newPassword || ''),
    });
  },

  async getPickupRequests() {
    return get('/pickups');
  },

  async getPickupRequestById(id) {
    return get(`/pickups/${id}`);
  },

  async createPickupRequest(data) {
    return post('/pickups', {
      resident_user_id: Number(data.resident_user_id),
      zone_id: Number(data.zone_id),
      pickup_address: data.pickup_address,
      pickup_latitude: data.pickup_latitude !== undefined && data.pickup_latitude !== null
        ? Number(data.pickup_latitude)
        : null,
      pickup_longitude: data.pickup_longitude !== undefined && data.pickup_longitude !== null
        ? Number(data.pickup_longitude)
        : null,
      waste_type: data.waste_type,
      estimated_weight_kg: data.estimated_weight_kg ? Number(data.estimated_weight_kg) : null,
      preferred_pickup_date: data.preferred_pickup_date || null,
      notes: data.notes || null,
    });
  },

  async getNearbyAvailableTrucks(zoneId, destinationPoint, limit = 6) {
    const lat = Number(destinationPoint?.lat);
    const lng = Number(destinationPoint?.lng);
    const query = new URLSearchParams({
      zone_id: String(Number(zoneId)),
      lat: String(lat),
      lng: String(lng),
      limit: String(Number(limit)),
    });
    return get(`/pickups/nearby-trucks?${query.toString()}`);
  },

  async assignNearestCollectorAndTruck(requestId, assignedByUserId = null, note = null) {
    return post(`/pickups/${requestId}/assign-nearest`, {
      assigned_by_user_id: assignedByUserId,
      note,
    });
  },

  async assignDirectTruckAndCollector(requestId, truckId, collectorUserId, note = null) {
    return post(`/pickups/${requestId}/assign-direct`, {
      truck_id: truckId ?? null,
      collector_user_id: collectorUserId ?? null,
      assigned_by_user_id: null,
      note,
    });
  },

  async confirmPickup(
    requestId,
    collectorUserId,
    completionNote = null,
    actualWeightKg = null,
    chargedAmount = null,
    chargeCurrency = null,
  ) {
    return patch(`/pickups/${requestId}/confirm`, {
      collector_user_id: Number(collectorUserId),
      completion_note: completionNote,
      actual_weight_kg: actualWeightKg !== null && actualWeightKg !== '' ? Number(actualWeightKg) : null,
      charged_amount: chargedAmount !== null && chargedAmount !== '' ? Number(chargedAmount) : null,
      charge_currency: chargeCurrency ? String(chargeCurrency).toUpperCase() : null,
    });
  },

  async markCollectorArrived(requestId, collectorUserId, arrivalNote = null) {
    return patch(`/pickups/${requestId}/arrived`, {
      collector_user_id: Number(collectorUserId),
      arrival_note: arrivalNote,
    });
  },

  async cancelPickupRequest(requestId, cancelledByUserId = null, cancellationNote = null) {
    return patch(`/pickups/${requestId}/cancel`, {
      cancelled_by_user_id: cancelledByUserId,
      cancellation_note: cancellationNote,
    });
  },

  async getCollectors() {
    return get('/collectors');
  },

  async createCollector(data) {
    return post('/collectors', {
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      password: data.password,
      address_line: data.address_line,
      employee_code: data.employee_code || undefined,
      home_zone_id: Number(data.home_zone_id),
      current_zone_id: Number(data.current_zone_id || data.home_zone_id),
      availability_status: data.availability_status || 'available',
      actor_user_id: data.actor_user_id ? Number(data.actor_user_id) : null,
    });
  },

  async updateCollector(collectorUserId, data) {
    return patch(`/collectors/${collectorUserId}`, {
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      password: data.password || '',
      address_line: data.address_line,
      employee_code: data.employee_code || undefined,
      home_zone_id: Number(data.home_zone_id),
      current_zone_id: Number(data.current_zone_id || data.home_zone_id),
      availability_status: data.availability_status || 'available',
      actor_user_id: data.actor_user_id ? Number(data.actor_user_id) : null,
    });
  },

  async deleteCollector(collectorUserId, actorUserId = null) {
    return del(`/collectors/${collectorUserId}`, {
      actor_user_id: actorUserId ? Number(actorUserId) : null,
    });
  },

  async updateCollectorAvailability(collectorUserId, availabilityStatus, actorUserId = null) {
    return patch(`/collectors/${collectorUserId}/availability`, {
      availability_status: availabilityStatus,
      actor_user_id: actorUserId,
    });
  },

  async getActivities(limit = 100) {
    return get(`/activities?limit=${Number(limit)}`);
  },

  async getPickupsPerZone() {
    return get('/reports/pickups-per-zone');
  },

  async getCompletionRates() {
    return get('/reports/completion-rates');
  },

  async getCollectorPerformance() {
    return get('/reports/collector-performance');
  },

  // ── Truck Management ───────────────────────────────────────────────────────
  async getTrucks() {
    return get('/trucks');
  },

  async createTruck(data) {
    return post('/trucks', {
      truck_code: String(data.truck_code || '').trim().toUpperCase(),
      plate_number: String(data.plate_number || '').trim().toUpperCase(),
      model_name: String(data.model_name || '').trim(),
      capacity_kg: Number(data.capacity_kg),
      average_speed_kmh: data.average_speed_kmh ? Number(data.average_speed_kmh) : 28.0,
      current_zone_id: Number(data.current_zone_id),
      truck_status: data.truck_status || 'available',
    });
  },

  async updateTruck(truckId, data) {
    return patch(`/trucks/${truckId}`, {
      truck_code: String(data.truck_code || '').trim().toUpperCase(),
      plate_number: String(data.plate_number || '').trim().toUpperCase(),
      model_name: String(data.model_name || '').trim(),
      capacity_kg: Number(data.capacity_kg),
      average_speed_kmh: data.average_speed_kmh ? Number(data.average_speed_kmh) : 28.0,
      current_zone_id: Number(data.current_zone_id),
      truck_status: data.truck_status || 'available',
    });
  },

  async updateTruckStatus(truckId, truck_status) {
    return patch(`/trucks/${truckId}/status`, { truck_status });
  },

  async deleteTruck(truckId) {
    return del(`/trucks/${truckId}`);
  },
  // ─────────────────────────────────────────────────────────────────────────

  // ── Zone Management ────────────────────────────────────────────────────────
  async getZonesFromDB() {
    return get('/zones');
  },

  async createZone(data) {
    return post('/zones', {
      zone_name: String(data.zone_name || '').trim(),
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
    });
  },

  async updateZone(zoneId, data) {
    return patch(`/zones/${zoneId}`, {
      zone_name: String(data.zone_name || '').trim(),
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    });
  },

  async toggleZoneStatus(zoneId, is_active) {
    return patch(`/zones/${zoneId}/status`, { is_active });
  },

  async deleteZone(zoneId) {
    return del(`/zones/${zoneId}`);
  },
  // ─────────────────────────────────────────────────────────────────────────

  async getAdmins() {
    return get('/admins');
  },

  async createAdmin(data) {
    return post('/admins', {
      full_name: String(data.full_name || '').trim(),
      email: String(data.email || '').trim().toLowerCase(),
      phone: String(data.phone || '').trim(),
      password: String(data.password || ''),
      address_line: String(data.address_line || '').trim(),
    });
  },

  async updateAdmin(adminUserId, data) {
    return patch(`/admins/${adminUserId}`, {
      full_name: String(data.full_name || '').trim(),
      email: String(data.email || '').trim().toLowerCase(),
      phone: String(data.phone || '').trim(),
      address_line: String(data.address_line || '').trim(),
    });
  },

  async setAdminStatus(adminUserId, account_status) {
    return patch(`/admins/${adminUserId}/status`, { account_status });
  },

  async resetAdminPassword(adminUserId, new_password) {
    return patch(`/admins/${adminUserId}/reset-password`, { new_password });
  },

  async deleteAdmin(adminUserId) {
    return del(`/admins/${adminUserId}`);
  },
  // ─────────────────────────────────────────────────────────────────────────

  async getResidentDashboardSummary(residentUserId) {
    const query = new URLSearchParams({ resident_user_id: String(Number(residentUserId)) });
    return get(`/resident/dashboard-summary?${query.toString()}`);
  },

  async getResidentRecentActivities(residentUserId, limit = 6) {
    const query = new URLSearchParams({
      resident_user_id: String(Number(residentUserId)),
      limit: String(Number(limit)),
    });
    return get(`/resident/recent-activities?${query.toString()}`);
  },

  async getResidentMonthlyStats(residentUserId, months = 6) {
    const query = new URLSearchParams({
      resident_user_id: String(Number(residentUserId)),
      months: String(Number(months)),
    });
    return get(`/resident/monthly-stats?${query.toString()}`);
  },

  getPaymentSettings() {
    const saved = readJsonStorage(PAYMENT_SETTINGS_KEY, DEFAULT_PAYMENT_SETTINGS);
    return {
      rate_per_kg: Number(saved?.rate_per_kg || DEFAULT_PAYMENT_SETTINGS.rate_per_kg),
      currency: saved?.currency || DEFAULT_PAYMENT_SETTINGS.currency,
    };
  },

  updatePaymentSettings(nextSettings) {
    const normalized = {
      rate_per_kg: Number(nextSettings?.rate_per_kg || DEFAULT_PAYMENT_SETTINGS.rate_per_kg),
      currency: String(nextSettings?.currency || DEFAULT_PAYMENT_SETTINGS.currency).toUpperCase(),
    };
    writeJsonStorage(PAYMENT_SETTINGS_KEY, normalized);
    return normalized;
  },

  calculatePickupCharge(weightKg) {
    const weight = Number(weightKg || 0);
    const { rate_per_kg, currency } = this.getPaymentSettings();
    const amount = Math.max(0, weight * rate_per_kg);
    return {
      weight_kg: weight,
      rate_per_kg,
      amount,
      currency,
    };
  },

  getPaymentRecords() {
    return readJsonStorage(PAYMENT_RECORDS_KEY, {});
  },

  getPaymentForRequest(requestId) {
    const records = this.getPaymentRecords();
    return records[String(requestId)] || null;
  },

  markRequestPayment(requestId, amount, currency = 'NGN', status = 'paid', actorName = 'Resident') {
    const records = this.getPaymentRecords();
    const key = String(requestId);
    records[key] = {
      request_id: Number(requestId),
      amount: Number(amount || 0),
      currency,
      status,
      paid_at: new Date().toISOString(),
      actor_name: actorName,
    };
    writeJsonStorage(PAYMENT_RECORDS_KEY, records);
    return records[key];
  },

  getNearbyTrucksForPickup(zoneId, userPoint, maxCount = 4, collectorPool = null) {
    const center = getZoneCenter(zoneId);
    const destination = userPoint || center;
    const zone = _zonesCache.find((z) => Number(z.id) === Number(zoneId));
    const zoneName = zone ? zone.zone_name : 'FCT';

    const SIM_MODELS = ['Hino 300', 'Isuzu NQR', 'Mercedes Atego', 'MAN TGL', 'Ashok Leyland Phoenix', 'DAF LF'];
    const SIM_DRIVERS = [
      'Musa Abdullahi', 'Emeka Okafor', 'Suleiman Bello', 'Chidi Nwosu',
      'Yusuf Garba', 'Tunde Adeyemi', 'Aminu Salisu', 'Kingsley Eze',
    ];
    const SIM_PLATES = ['ABJ-234-KJ', 'FCT-891-AW', 'ABJ-567-MN', 'FCT-102-ZR', 'ABJ-774-QX', 'FCT-345-BV'];
    const SIM_CAPACITIES = [800, 1000, 1200, 1500, 2000, 2500];

    if (Array.isArray(collectorPool)) {
      const trucksFromCollectors = collectorPool.map((collector, index) => {
        const truckLat = center.lat + randomBetween(-0.018, 0.018);
        const truckLng = center.lng + randomBetween(-0.018, 0.018);
        const speedKmPerHour = randomBetween(24, 40);
        const distanceKm = haversineDistanceKm(
          { lat: truckLat, lng: truckLng },
          destination,
        );
        const etaMinutes = Math.max(4, Math.round((distanceKm / speedKmPerHour) * 60));
        const modelIdx = (index + Number(zoneId)) % SIM_MODELS.length;
        const plateIdx = (index + Number(zoneId) + 1) % SIM_PLATES.length;
        const capIdx = (index + Number(zoneId)) % SIM_CAPACITIES.length;

        return {
          truck_id: `COL-TRUCK-${collector.collector_user_id || index + 1}`,
          truck_code: `TRK-${String(zoneId).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
          plate_number: SIM_PLATES[plateIdx],
          model_name: SIM_MODELS[modelIdx],
          capacity_kg: SIM_CAPACITIES[capIdx],
          current_zone: zoneName,
          collector_name: collector.full_name || SIM_DRIVERS[index % SIM_DRIVERS.length],
          employee_code: collector.employee_code || `EMP-${String(index + 1).padStart(3, '0')}`,
          collector_phone: collector.phone || null,
          total_completed: collector.total_completed ?? Math.floor(randomBetween(10, 120)),
          average_rating: collector.average_rating ?? Number(randomBetween(3.5, 5.0).toFixed(1)),
          collector_user_id: collector.collector_user_id,
          lat: truckLat,
          lng: truckLng,
          average_speed_kmh: Math.round(speedKmPerHour),
          speed_kmh: Math.round(speedKmPerHour),
          distance_km: Number(distanceKm.toFixed(2)),
          eta_minutes: etaMinutes,
        };
      });

      return trucksFromCollectors
        .sort((a, b) => a.eta_minutes - b.eta_minutes)
        .slice(0, Number(maxCount));
    }

    const trucks = Array.from({ length: 6 }).map((_, index) => {
      const truckLat = center.lat + randomBetween(-0.018, 0.018);
      const truckLng = center.lng + randomBetween(-0.018, 0.018);
      const speedKmPerHour = randomBetween(24, 40);
      const distanceKm = haversineDistanceKm(
        { lat: truckLat, lng: truckLng },
        destination,
      );
      const etaMinutes = Math.max(4, Math.round((distanceKm / speedKmPerHour) * 60));
      const modelIdx = (index + Number(zoneId)) % SIM_MODELS.length;
      const plateIdx = (index + Number(zoneId) + 2) % SIM_PLATES.length;
      const capIdx = (index + Number(zoneId) + 1) % SIM_CAPACITIES.length;
      const driverIdx = (index + Number(zoneId)) % SIM_DRIVERS.length;

      return {
        truck_id: `SIM-TRUCK-${zoneId}-${index + 1}`,
        truck_code: `TRK-${String(zoneId).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
        plate_number: SIM_PLATES[plateIdx],
        model_name: SIM_MODELS[modelIdx],
        capacity_kg: SIM_CAPACITIES[capIdx],
        current_zone: zoneName,
        collector_name: SIM_DRIVERS[driverIdx],
        employee_code: `EMP-${String((Number(zoneId) * 10) + index + 1).padStart(3, '0')}`,
        collector_phone: null,
        total_completed: Math.floor(randomBetween(8, 140)),
        average_rating: Number(randomBetween(3.4, 5.0).toFixed(1)),
        lat: truckLat,
        lng: truckLng,
        average_speed_kmh: Math.round(speedKmPerHour),
        speed_kmh: Math.round(speedKmPerHour),
        distance_km: Number(distanceKm.toFixed(2)),
        eta_minutes: etaMinutes,
      };
    });

    return trucks
      .sort((a, b) => a.eta_minutes - b.eta_minutes)
      .slice(0, Number(maxCount));
  },

  simulateTruckMovement(currentPoint, targetPoint, factor = 0.08) {
    if (!currentPoint || !targetPoint) return currentPoint;
    const nextLat = currentPoint.lat + (targetPoint.lat - currentPoint.lat) * factor;
    const nextLng = currentPoint.lng + (targetPoint.lng - currentPoint.lng) * factor;
    return { lat: nextLat, lng: nextLng };
  },

};

export default apiService;
