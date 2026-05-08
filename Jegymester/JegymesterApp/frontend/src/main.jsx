import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  apiRequest,
  clearAuth,
  getMe,
  getSavedAuth,
  getRole,
  isAdmin,
  login,
  registerUser,
  saveAuth,
} from './api';
import './style.css';

const MAX_HALL_CAPACITY = 50;
const RESERVATIONS_KEY = 'jegymester_reservations_v2';
const HALL_CONFIG_KEY = 'jegymester_hall_config_v2';
const SCHEDULE_META_KEY = 'jegymester_schedule_meta_v2';
const PROFILE_OVERRIDES_KEY = 'jegymester_profile_overrides_v2';
const PUBLIC_DAYS_AHEAD = 21;

const ticketCategories = {
  adult: { label: 'Felnőtt', price: 2500 },
  student: { label: 'Diák', price: 1900 },
  senior: { label: 'Nyugdíjas', price: 1800 },
  child: { label: 'Gyerek', price: 1500 },
  family: { label: 'Családi', price: 2100, familyBase: 8500, familyExtra: 1900 },
};

const defaultScheduleMeta = {
  movieRuntime: 120,
  ads: 15,
  trailers: 10,
  cleaning: 20,
};

const resources = {
  movies: {
    label: 'Filmek',
    endpoint: '/movie/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['name', 'Név'],
      ['description', 'Leírás'],
    ],
    emptyForm: { name: '', description: '' },
    fields: [
      ['name', 'Film neve', 'text'],
      ['description', 'Leírás', 'textarea'],
    ],
    search: {
      placeholder: 'Keresés film címe vagy leírása alapján, pl. Dune...',
      fields: ['name', 'description'],
    },
  },
  halls: {
    label: 'Termek',
    endpoint: '/hall/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['name', 'Név'],
      ['capacity', 'Backend férőhely'],
    ],
    emptyForm: { name: '', capacity: '' },
    fields: [
      ['name', 'Terem neve', 'text'],
      ['capacity', 'Férőhely, max. 50', 'number'],
    ],
  },
  screenings: {
    label: 'Vetítések',
    endpoint: '/screening/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['time', 'Idő'],
      ['place', 'Hely'],
      ['movie.name', 'Film'],
      ['hall.name', 'Terem'],
      ['movie_id', 'Film ID'],
      ['hall_id', 'Terem ID'],
    ],
    emptyForm: { time: '', place: '', movie_id: '', hall_id: '' },
    fields: [
      ['time', 'Idő, pl. 1800', 'number'],
      ['place', 'Hely', 'text'],
      ['movie_id', 'Film ID', 'number'],
      ['hall_id', 'Terem ID', 'number'],
    ],
  },
  tickets: {
    label: 'Jegyek',
    endpoint: '/ticket/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['cost', 'Ár'],
      ['available', 'Elérhető'],
      ['screening_id', 'Vetítés ID'],
      ['user_id', 'Felhasználó ID'],
      ['user.name', 'Tulajdonos'],
    ],
    emptyForm: { cost: '', screening_id: '', user_id: '' },
    fields: [
      ['cost', 'Ár', 'number'],
      ['screening_id', 'Vetítés ID', 'number'],
      ['user_id', 'Felhasználó ID (üresen hagyható)', 'number'],
    ],
    createOnly: true,
    noDelete: true,
  },
  users: {
    label: 'Felhasználók',
    endpoint: '/user/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['name', 'Név'],
      ['email', 'E-mail'],
      ['phone', 'Telefon'],
      ['role.name', 'Szerepkör'],
    ],
    readOnly: true,
  },
};

function getValue(row, path) {
  return path.split('.').reduce((value, key) => value?.[key], row);
}

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase().trim();
}

function filterRows(rows, searchText, fields) {
  const query = normalizeSearchText(searchText);

  if (!query || !fields?.length) {
    return rows;
  }

  return rows.filter((row) =>
    fields.some((field) => normalizeSearchText(getValue(row, field)).includes(query))
  );
}

function normalizePayload(form) {
  const payload = {};

  Object.entries(form).forEach(([key, value]) => {
    if (value === '') {
      payload[key] = null;
      return;
    }

    if (['capacity', 'time', 'movie_id', 'hall_id', 'cost', 'screening_id', 'user_id'].includes(key)) {
      payload[key] = Number(value);
    } else {
      payload[key] = value;
    }
  });

  return payload;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getReservations() {
  return readStorage(RESERVATIONS_KEY, []);
}

function saveReservations(reservations) {
  writeStorage(RESERVATIONS_KEY, reservations);
}

function getHallConfigs() {
  return readStorage(HALL_CONFIG_KEY, {});
}

function saveHallConfigs(configs) {
  writeStorage(HALL_CONFIG_KEY, configs);
}

function getScheduleMeta() {
  return readStorage(SCHEDULE_META_KEY, {});
}

function saveScheduleMeta(meta) {
  writeStorage(SCHEDULE_META_KEY, meta);
}

function isCashier(auth) {
  const role = getRole(auth);
  return role === 'penztaros' || role === 'adminisztrator';
}

function isCashierOnly(auth) {
  return getRole(auth) === 'penztaros';
}

function isRegularUser(auth) {
  return getRole(auth) === 'felhasznalo';
}

function getScreeningMovie(screening, movies = []) {
  return screening.movie || movies.find((movie) => Number(movie.id) === Number(screening.movie_id)) || null;
}

function getScreeningHall(screening, halls = []) {
  return screening.hall || halls.find((hall) => Number(hall.id) === Number(screening.hall_id)) || null;
}

function timeToText(time) {
  const raw = String(time ?? '').padStart(4, '0');
  if (raw.length === 4) {
    return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  }
  return String(time ?? '-');
}

function getDayPart(time) {
  const hour = Number(String(time ?? '0').padStart(4, '0').slice(0, 2));
  if (hour < 12) return 'délelőtt';
  if (hour < 18) return 'délután';
  return 'este';
}

function createReservationCode() {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `JM-${Date.now().toString().slice(-5)}-${random}`;
}

function getHallEffectiveCapacity(hall, hallConfigs = getHallConfigs()) {
  const rawCapacity = Number(hall?.capacity || MAX_HALL_CAPACITY);
  const configured = Number(hallConfigs?.[hall?.id]?.capacity || rawCapacity);
  return Math.max(1, Math.min(MAX_HALL_CAPACITY, configured || rawCapacity || MAX_HALL_CAPACITY));
}

function generateSeats(capacity) {
  const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: capacity }, (_, index) => {
    const row = rowLetters[Math.floor(index / 10)] || 'Z';
    const number = (index % 10) + 1;
    return `${row}${number}`;
  });
}

function getTakenSeats(screeningId, reservations = getReservations()) {
  return reservations
    .filter((reservation) => Number(reservation.screeningId) === Number(screeningId) && reservation.status !== 'cancelled')
    .flatMap((reservation) => reservation.seats || []);
}

function getFreeSeats(screeningId, hall, reservations, hallConfigs) {
  const hallConfig = hallConfigs?.[hall?.id] || {};
  const allSeats = generateSeats(getHallEffectiveCapacity(hall, hallConfigs));
  const taken = new Set(getTakenSeats(screeningId, reservations));
  const closed = new Set(hallConfig.closedSeats || []);
  return allSeats.filter((seat) => !taken.has(seat) && !closed.has(seat));
}

function getAvailabilitySummary(screening, hall, reservations = getReservations(), hallConfigs = getHallConfigs()) {
  const capacity = getHallEffectiveCapacity(hall, hallConfigs);
  const takenCount = getTakenSeats(screening?.id, reservations).length;
  const closedCount = (hallConfigs?.[hall?.id]?.closedSeats || []).filter((seat) => generateSeats(capacity).includes(seat)).length;
  const freeSeats = getFreeSeats(screening?.id, hall, reservations, hallConfigs);
  const free = freeSeats.length;
  const occupiedPercent = capacity > 0 ? Math.min(100, Math.round(((takenCount + closedCount) / capacity) * 100)) : 100;

  return {
    capacity,
    taken: takenCount,
    closed: closedCount,
    free,
    freeSeats,
    soldOut: free <= 0,
    almostSoldOut: free > 0 && free <= 5,
    occupiedPercent,
  };
}

function normalizeTicketCount(value, max = MAX_HALL_CAPACITY) {
  const numeric = Math.floor(Number(value));
  const safeMax = Math.max(1, Number(max) || 1);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.min(safeMax, numeric);
}

function calculateTotal(categoryKey, seats, hallConfig = {}) {
  const category = ticketCategories[categoryKey] || ticketCategories.adult;
  const count = seats.length;
  const vipSeats = new Set(hallConfig.vipSeats || []);
  const vipExtra = seats.filter((seat) => vipSeats.has(seat)).length * 600;

  if (categoryKey === 'family' && count >= 4) {
    return category.familyBase + Math.max(0, count - 4) * category.familyExtra + vipExtra;
  }

  return count * category.price + vipExtra;
}

function getScheduleInfo(screeningId, meta = getScheduleMeta()) {
  const saved = meta?.[screeningId] || {};
  const merged = { ...defaultScheduleMeta, ...saved };
  return {
    ...merged,
    total: Number(merged.movieRuntime || 0) + Number(merged.ads || 0) + Number(merged.trailers || 0),
    roomBlocked: Number(merged.movieRuntime || 0) + Number(merged.ads || 0) + Number(merged.trailers || 0) + Number(merged.cleaning || 0),
  };
}


const publicDemoData = {
  movies: [
    { id: 9001, name: 'Dune: Második rész', description: 'Sci-fi kalandfilm, homokféreggel és látványos csatákkal.' },
    { id: 9002, name: 'Avatar', description: 'Látványos fantasy/sci-fi film családoknak és fiataloknak.' },
    { id: 9003, name: 'Magyar vígjáték', description: 'Könnyed esti film a teremteszteléshez.' },
  ],
  halls: [
    { id: 9101, name: '1. terem', capacity: 50 },
    { id: 9102, name: 'VIP terem', capacity: 30 },
  ],
  screenings: [
    { id: 9201, time: 1600, place: '1. terem', movie_id: 9001, hall_id: 9101 },
    { id: 9202, time: 1830, place: 'VIP terem', movie_id: 9001, hall_id: 9102 },
    { id: 9203, time: 2000, place: '1. terem', movie_id: 9002, hall_id: 9101 },
  ],
};

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function dateValueAfterDays(days = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getScreeningDate(screening, meta = getScheduleMeta()) {
  return screening?.date || meta?.[screening?.id]?.date || todayDateValue();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function normalizeCatalogData(rawData = {}) {
  const movies = asArray(rawData.movies);
  const halls = asArray(rawData.halls);
  const screenings = asArray(rawData.screenings);

  return {
    movies: movies.length ? movies : publicDemoData.movies,
    halls: halls.length ? halls : publicDemoData.halls,
    screenings: screenings.length ? screenings : publicDemoData.screenings,
  };
}

function syntheticScreeningId(screening, dayIndex, position) {
  const base = Number(screening?.id);
  if (Number.isFinite(base)) return base * 1000 + dayIndex * 50 + position;
  return 9000000 + dayIndex * 100 + position;
}

function buildDailyCatalog(rawData, days = PUBLIC_DAYS_AHEAD) {
  const catalog = normalizeCatalogData(rawData);
  const sourceScreenings = catalog.screenings.length ? catalog.screenings : publicDemoData.screenings;

  const expandedScreenings = Array.from({ length: Math.max(1, Number(days) || 1) }, (_, dayIndex) => {
    const date = dateValueAfterDays(dayIndex);
    return sourceScreenings.map((screening, index) => ({
      ...screening,
      id: syntheticScreeningId(screening, dayIndex, index),
      originalScreeningId: screening.id,
      date,
    }));
  }).flat();

  return {
    ...catalog,
    screenings: expandedScreenings,
  };
}

function availableScheduleDates(days = PUBLIC_DAYS_AHEAD) {
  return Array.from({ length: Math.max(1, Number(days) || 1) }, (_, index) => dateValueAfterDays(index));
}

function formatDateHu(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('hu-HU', { month: 'short', day: '2-digit', weekday: 'short' });
}

function getScreeningDateTimeFromParts(dateValue, timeValue) {
  const date = dateValue || todayDateValue();
  const raw = String(timeValue ?? '0').padStart(4, '0');
  const hour = raw.slice(0, 2);
  const minute = raw.slice(2, 4);
  return new Date(`${date}T${hour}:${minute || '00'}:00`);
}

function getReservationScreeningDateTime(reservation) {
  return getScreeningDateTimeFromParts(reservation?.screeningDate, reservation?.time);
}

function canCancelTicketOrder(reservation) {
  const screeningAt = getReservationScreeningDateTime(reservation);
  if (Number.isNaN(screeningAt.getTime())) return true;
  return screeningAt.getTime() - Date.now() >= 4 * 60 * 60 * 1000;
}

function cancelWindowText(reservation) {
  const screeningAt = getReservationScreeningDateTime(reservation);
  if (Number.isNaN(screeningAt.getTime())) return 'Időpont nem értelmezhető.';
  const diffHours = Math.floor((screeningAt.getTime() - Date.now()) / (60 * 60 * 1000));
  return diffHours >= 4
    ? `Törölhető, még kb. ${diffHours} óra van hátra.`
    : 'Nem törölhető: a vetítés kezdete előtt 4 órán belül van.';
}

function getOrderStatusLabel(reservation) {
  if (reservation.status === 'paid') return 'megvásárolva / fizetve';
  if (reservation.status === 'reserved') return 'lefoglalva';
  if (reservation.status === 'cancelled') return 'törölve / sztornózva';
  return reservation.status || '-';
}

function getProfileOverrides() {
  return readStorage(PROFILE_OVERRIDES_KEY, {});
}

function saveProfileOverride(userId, profile) {
  const overrides = getProfileOverrides();
  const next = { ...overrides, [userId]: profile };
  writeStorage(PROFILE_OVERRIDES_KEY, next);
  return next;
}

function getDisplayUser(auth) {
  if (!auth?.user?.id) return auth?.user || {};
  const override = getProfileOverrides()[auth.user.id] || {};
  return { ...auth.user, ...override };
}

async function loadCatalogData(token = null, useDemoOnError = false) {
  try {
    const [movies, halls, screenings] = await Promise.all([
      apiRequest('/movie/', {}, token),
      apiRequest('/hall/', {}, token),
      apiRequest('/screening/', {}, token),
    ]);
    return { data: normalizeCatalogData({ movies, halls, screenings }), usedDemo: false, error: '' };
  } catch (err) {
    if (useDemoOnError) {
      return {
        data: normalizeCatalogData(publicDemoData),
        usedDemo: true,
        error: 'A backend jelenleg tokenhez köti a filmek/vetítések listázását, ezért a bejelentkezés nélküli nézet demó műsorral működik. A vendég jegyvásárlás ettől függetlenül működik a frontenden, e-mail és telefonszám megadásával.',
      };
    }
    throw err;
  }
}

function makeTicketOrder({
  auth,
  selectedScreening,
  selectedMovie,
  selectedHall,
  selectedSeats,
  category,
  status,
  paymentMethod,
  buyerName,
  guestEmail = '',
  guestPhone = '',
  source = 'online',
  scheduleMeta = getScheduleMeta(),
  cashierName = '',
}) {
  const now = new Date().toISOString();
  const hallConfig = getHallConfigs()[selectedHall?.id] || {};
  const paid = status === 'paid';

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    code: createReservationCode(),
    userId: auth?.user?.id || null,
    userName: buyerName || auth?.user?.name || 'Vendég',
    guestEmail,
    guestPhone,
    source,
    cashierName,
    screeningId: selectedScreening.id,
    movieName: selectedMovie.name,
    hallId: selectedHall.id,
    hallName: selectedHall.name,
    place: selectedScreening.place,
    time: selectedScreening.time,
    screeningDate: getScreeningDate(selectedScreening, scheduleMeta),
    seats: selectedSeats,
    category,
    categoryLabel: ticketCategories[category].label,
    total: calculateTotal(category, selectedSeats, hallConfig),
    status,
    paymentMethod,
    createdAt: now,
    paidAt: paid ? now : null,
  };
}

function Message({ message, type = 'info' }) {
  if (!message) return null;
  return <div className={`message ${type}`}>{message}</div>;
}


function PublicCatalog({ onGoLogin }) {
  const [data, setData] = useState(buildDailyCatalog(publicDemoData));
  const [reservations, setReservations] = useState(getReservations());
  const [hallConfigs, setHallConfigs] = useState(getHallConfigs());
  const [scheduleMeta, setScheduleMeta] = useState(getScheduleMeta());
  const [filters, setFilters] = useState({ movie: '', date: '', dayPart: '', place: '' });
  const [selectedScreeningId, setSelectedScreeningId] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [ticketCount, setTicketCount] = useState(1);
  const [category, setCategory] = useState('adult');
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedScreening = data.screenings.find((screening) => Number(screening.id) === Number(selectedScreeningId));
  const selectedHall = selectedScreening ? getScreeningHall(selectedScreening, data.halls) : null;
  const selectedMovie = selectedScreening ? getScreeningMovie(selectedScreening, data.movies) : null;
  const selectedHallConfig = selectedHall ? hallConfigs[selectedHall.id] || {} : {};
  const selectedSeatsAll = selectedHall ? generateSeats(getHallEffectiveCapacity(selectedHall, hallConfigs)) : [];
  const takenSeats = selectedScreening ? getTakenSeats(selectedScreening.id, reservations) : [];
  const total = calculateTotal(category, selectedSeats, selectedHallConfig);

  const places = useMemo(() => {
    const values = data.screenings.map((screening) => screening.place || getScreeningHall(screening, data.halls)?.name).filter(Boolean);
    return [...new Set(values)];
  }, [data.screenings, data.halls]);

  const scheduleDates = useMemo(() => availableScheduleDates(), []);

  const filteredScreenings = useMemo(() => {
    const movieQuery = normalizeSearchText(filters.movie);
    return data.screenings.filter((screening) => {
      const movie = getScreeningMovie(screening, data.movies);
      const hall = getScreeningHall(screening, data.halls);
      const movieText = normalizeSearchText(`${movie?.name || ''} ${movie?.description || ''}`);
      const placeText = screening.place || hall?.name || '';
      const dateText = getScreeningDate(screening, scheduleMeta);
      if (movieQuery && !movieText.includes(movieQuery)) return false;
      if (filters.date && dateText !== filters.date) return false;
      if (filters.dayPart && getDayPart(screening.time) !== filters.dayPart) return false;
      if (filters.place && placeText !== filters.place) return false;
      return true;
    });
  }, [data.screenings, data.movies, data.halls, filters, scheduleMeta]);

  async function loadData() {
    setLoading(true);
    setError('');
    const result = await loadCatalogData(null, true);
    setData(buildDailyCatalog(result.data));
    setError(result.error);
    setReservations(getReservations());
    setHallConfigs(getHallConfigs());
    setScheduleMeta(getScheduleMeta());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = window.setInterval(() => {
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedSeats([]);
  }, [selectedScreeningId]);

  function autoSelectGuestSeats() {
    if (!selectedScreening || !selectedHall) return;
    const freeSeats = getFreeSeats(selectedScreening.id, selectedHall, getReservations(), getHallConfigs());
    const requested = Math.max(1, Number(ticketCount) || 1);
    if (freeSeats.length < requested) {
      setError(`Nincs elég szabad hely. Kért: ${requested}, szabad: ${freeSeats.length}.`);
      return;
    }
    setSelectedSeats(freeSeats.slice(0, requested));
  }

  function toggleSeat(seat) {
    const requested = normalizeTicketCount(ticketCount, getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free || 1);
    setSelectedSeats((current) => {
      if (current.includes(seat)) return current.filter((item) => item !== seat);
      if (current.length >= requested) {
        setError(`Már kiválasztottad a kért ${requested} jegyet. Növeld a jegyek számát, vagy törölj egy kijelölést.`);
        return current;
      }
      return [...current, seat];
    });
  }

  function createGuestPurchase() {
    setError('');
    setMessage('');
    if (!selectedScreening || !selectedHall || !selectedMovie) {
      setError('Előbb válassz vetítést.');
      return;
    }
    if (!guest.email || !guest.phone) {
      setError('Vendég vásárláshoz kötelező az e-mail cím és a telefonszám.');
      return;
    }
    const requested = normalizeTicketCount(ticketCount, getAvailabilitySummary(selectedScreening, selectedHall, getReservations(), getHallConfigs()).free || 1);
    const availability = getAvailabilitySummary(selectedScreening, selectedHall, getReservations(), getHallConfigs());
    if (availability.soldOut || availability.free < requested) {
      setReservations(getReservations());
      setError(`Erre a vetítésre már nincs elég szabad hely. Kért: ${requested}, szabad: ${availability.free}.`);
      return;
    }
    if (selectedSeats.length === 0) {
      setError('Válassz legalább 1 helyet.');
      return;
    }
    if (selectedSeats.length !== requested) {
      setError(`Pont ${requested} helyet kell kijelölni a vásárláshoz. Most kijelölve: ${selectedSeats.length}.`);
      return;
    }
    const freeSeatsNow = new Set(getFreeSeats(selectedScreening.id, selectedHall, getReservations(), getHallConfigs()));
    const conflictSeat = selectedSeats.find((seat) => !freeSeatsNow.has(seat));
    if (conflictSeat) {
      setReservations(getReservations());
      setError(`A(z) ${conflictSeat} hely közben foglalt vagy lezárt lett.`);
      return;
    }
    const order = makeTicketOrder({
      selectedScreening,
      selectedMovie,
      selectedHall,
      selectedSeats,
      category,
      status: 'paid',
      paymentMethod: 'vendég online fizetés',
      buyerName: guest.name || 'Vendég vásárló',
      guestEmail: guest.email,
      guestPhone: guest.phone,
      source: 'guest',
      scheduleMeta,
    });
    const next = [...getReservations(), order];
    saveReservations(next);
    setReservations(next);
    setSelectedSeats([]);
    setMessage(`Vendég jegyvásárlás sikeres. Jegykód: ${order.code}. Fizetve: ${order.total} Ft.`);
  }

  return (
    <section className="card public-catalog">
      <div className="card-title-row">
        <h2>Publikus műsor és vendég jegyvásárlás</h2>
        <button onClick={loadData}>Műsor frissítése</button>
      </div>
      <p className="muted">A filmek és vetítések bejelentkezés nélkül is megtekinthetők. Vendég vásárlásnál e-mail és telefon megadása kötelező.</p>
      <Message message={error} type="info" />
      <Message message={message} type="success" />
      {loading ? <p>Publikus műsor betöltése...</p> : (
        <>
          <div className="grid-form">
            <label>Film címe vagy leírása<input type="search" value={filters.movie} onChange={(e) => setFilters({ ...filters, movie: e.target.value })} placeholder="Pl. Dune" /></label>
            <label>Dátum<input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></label>
            <label>Napszak<select value={filters.dayPart} onChange={(e) => setFilters({ ...filters, dayPart: e.target.value })}><option value="">Mindegy</option><option value="délelőtt">Délelőtt</option><option value="délután">Délután</option><option value="este">Este</option></select></label>
            <label>Mozihelyszín<select value={filters.place} onChange={(e) => setFilters({ ...filters, place: e.target.value })}><option value="">Mindegy</option>{places.map((place) => <option key={place} value={place}>{place}</option>)}</select></label>
          </div>
          <div className="quick-date-row">
            <button type="button" className={!filters.date ? 'active' : ''} onClick={() => setFilters({ ...filters, date: '' })}>Minden dátum</button>
            {scheduleDates.slice(0, 10).map((dateValue) => (
              <button key={dateValue} type="button" className={filters.date === dateValue ? 'active' : ''} onClick={() => setFilters({ ...filters, date: dateValue })}>{formatDateHu(dateValue)}</button>
            ))}
          </div>
          <section className="cards-grid">
            {filteredScreenings.map((screening) => {
              const movie = getScreeningMovie(screening, data.movies);
              const hall = getScreeningHall(screening, data.halls);
              const availability = getAvailabilitySummary(screening, hall, reservations, hallConfigs);
              return (
                <article key={screening.id} className={`screening-card ${Number(selectedScreeningId) === Number(screening.id) ? 'selected-card' : ''} ${availability.soldOut ? 'sold-out' : ''}`}>
                  <div className="card-title-row"><h3>{movie?.name}</h3><span className={`badge ${availability.soldOut ? 'danger-badge' : availability.almostSoldOut ? 'warning-badge' : ''}`}>{availability.soldOut ? 'Elfogyott' : `${getScreeningDate(screening, scheduleMeta)} · ${timeToText(screening.time)}`}</span></div>
                  <p className="muted">{movie?.description}</p>
                  <p><strong>Terem:</strong> {hall?.name || screening.place} · <strong>Szabad hely:</strong> {availability.free} / {availability.capacity}</p>
                  <div className="capacity-meter"><span style={{ width: `${availability.occupiedPercent}%` }} /></div>
                  <button className="primary" disabled={availability.soldOut} onClick={() => setSelectedScreeningId(screening.id)}>{availability.soldOut ? 'Nincs több szék' : 'Vendégként erre veszek jegyet'}</button>
                </article>
              );
            })}
            {filteredScreenings.length === 0 && <p>Nincs találat. Válassz másik dátumot, vagy töröld a dátumszűrést.</p>}
          </section>
          {selectedScreening && selectedHall && selectedMovie && (
            <section className="card nested-card">
              <h3>Vendég vásárlás: {selectedMovie.name} · {getScreeningDate(selectedScreening, scheduleMeta)} {timeToText(selectedScreening.time)}</h3>
              <div className="grid-form">
                <label>Név<input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Vendég neve" /></label>
                <label>E-mail cím<input type="email" required value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></label>
                <label>Telefonszám<input required value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
                <label>Jegyek száma<input type="number" min="1" max={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free || 1} value={ticketCount} onChange={(e) => { const max = getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free || 1; const next = normalizeTicketCount(e.target.value, max); setTicketCount(next); setSelectedSeats((current) => current.slice(0, next)); }} /></label>
                <label>Kategória<select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(ticketCategories).map(([key, item]) => <option key={key} value={key}>{item.label} · {item.price} Ft/fő</option>)}</select></label>
                <div className="stat-box"><span>Fizetendő</span><strong>{total} Ft</strong></div>
              </div>
              <div className="ticket-summary">
                <span>Szabad hely: <strong>{getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free}</strong></span>
                <span>Terem állapota: <strong>{getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut ? 'Elfogyott' : 'Foglalható'}</strong></span>
                <span>Kért jegy: <strong>{ticketCount}</strong></span>
                <span>Kijelölve: <strong>{selectedSeats.length}</strong></span>
              </div>
              <SeatGrid seats={selectedSeatsAll} selectedSeats={selectedSeats} takenSeats={takenSeats} vipSeats={selectedHallConfig.vipSeats || []} closedSeats={selectedHallConfig.closedSeats || []} onToggleSeat={toggleSeat} />
              <div className="form-actions">
                <button type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut} onClick={autoSelectGuestSeats}>Automatikus helyválasztás</button>
                <button type="button" onClick={() => setSelectedSeats([])}>Kijelölés törlése</button>
                <button className="primary" type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut} onClick={createGuestPurchase}>Vendég jegyvásárlás</button>
                <button type="button" onClick={onGoLogin}>Bejelentkezés / regisztráció</button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await login(loginForm.email, loginForm.password);
      if (!response?.access_token) {
        throw new Error('A backend nem adott vissza JWT tokent.');
      }
      const auth = {
        token: response.access_token,
        tokenType: response.token_type || 'Bearer',
        expiresIn: response.expires_in,
        user: response.user,
      };
      saveAuth(auth);
      onLogin(auth);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await registerUser(registerForm);
      setSuccess('Sikeres regisztráció. Most jelentkezz be az e-mail címmel és jelszóval.');
      setMode('login');
      setLoginForm({ email: registerForm.email, password: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>JegyMester</h1>
        <p className="muted">A frontend csak akkor enged be, ha a Python backend érvényes JWT tokent ad vissza.</p>

        <div className="tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Bejelentkezés</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Regisztráció</button>
          <button className={mode === 'public' ? 'active' : ''} onClick={() => setMode('public')}>Műsor / vendég vásárlás</button>
        </div>

        <Message message={error} type="error" />
        <Message message={success} type="success" />

        {mode === 'public' ? (
          <PublicCatalog onGoLogin={() => setMode('login')} />
        ) : mode === 'login' ? (
          <form onSubmit={handleLogin} className="form">
            <label>
              E-mail
              <input
                type="email"
                required
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                placeholder="admin@jegymester.hu"
              />
            </label>
            <label>
              Jelszó
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="Jelszó"
              />
            </label>
            <button className="primary" disabled={loading}>{loading ? 'Belépés...' : 'Belépés JWT tokennel'}</button>
            <p className="muted small">Teszt adatok: user@jegymester.hu / user123, cashier@jegymester.hu / cashier123, admin@jegymester.hu / admin123</p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="form">
            <label>
              Név
              <input required minLength="2" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} />
            </label>
            <label>
              E-mail
              <input type="email" required value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} />
            </label>
            <label>
              Telefon
              <input required value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} />
            </label>
            <label>
              Jelszó
              <input type="password" required minLength="4" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
            </label>
            <button className="primary" disabled={loading}>{loading ? 'Mentés...' : 'Regisztráció'}</button>
          </form>
        )}
      </section>
    </main>
  );
}

function Header({ auth, activePage, setActivePage, onLogout }) {
  const displayUser = getDisplayUser(auth);
  const role = getRole(auth);
  const admin = isAdmin(auth);
  const cashier = isCashierOnly(auth);
  const regularUser = isRegularUser(auth);

  return (
    <header className="app-header">
      <div>
        <h1>JegyMester Mozi</h1>
        <p>{displayUser?.name} · <strong>{role || 'nincs szerepkör'}</strong></p>
      </div>
      <nav>
        {regularUser && <button className={activePage === 'booking' ? 'active' : ''} onClick={() => setActivePage('booking')}>Műsorrend / foglalás</button>}
        {regularUser && <button className={activePage === 'profile' ? 'active' : ''} onClick={() => setActivePage('profile')}>Profilom</button>}
        {cashier && <button className={activePage === 'cashier' ? 'active' : ''} onClick={() => setActivePage('cashier')}>Pénztáros</button>}
        {admin && <button className={activePage === 'admin' ? 'active' : ''} onClick={() => setActivePage('admin')}>Admin kezelő</button>}
        <button onClick={onLogout}>Kijelentkezés</button>
      </nav>
    </header>
  );
}

function DataTable({ columns, rows, actions }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([, label]) => <th key={label}>{label}</th>)}
            {actions && <th>Műveletek</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + (actions ? 1 : 0)}>Nincs adat.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id ?? row.code}>
              {columns.map(([key]) => {
                const value = getValue(row, key);
                return <td key={key}>{typeof value === 'boolean' ? (value ? 'igen' : 'nem') : value ?? '-'}</td>;
              })}
              {actions && <td className="actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeatGrid({ seats, selectedSeats = [], takenSeats = [], vipSeats = [], closedSeats = [], onToggleSeat, readonly = false }) {
  const selected = new Set(selectedSeats);
  const taken = new Set(takenSeats);
  const vip = new Set(vipSeats);
  const closed = new Set(closedSeats);

  return (
    <div className="seat-grid" aria-label="Ülésrend">
      {seats.map((seat) => {
        const isTaken = taken.has(seat);
        const isClosed = closed.has(seat);
        const className = [
          'seat',
          selected.has(seat) ? 'selected' : '',
          isTaken ? 'taken' : '',
          vip.has(seat) ? 'vip' : '',
          isClosed ? 'closed' : '',
        ].filter(Boolean).join(' ');

        return (
          <button
            key={seat}
            type="button"
            className={className}
            disabled={readonly || isTaken || isClosed}
            title={isClosed ? `${seat} lezárva` : isTaken ? `${seat} foglalt` : vip.has(seat) ? `${seat} VIP hely` : `${seat} szabad`}
            onClick={() => onToggleSeat?.(seat)}
          >
            {seat}
          </button>
        );
      })}
    </div>
  );
}

function BookingPage({ auth }) {
  const [data, setData] = useState({ movies: [], halls: [], screenings: [] });
  const [reservations, setReservations] = useState(getReservations());
  const [hallConfigs, setHallConfigs] = useState(getHallConfigs());
  const [scheduleMeta, setScheduleMeta] = useState(getScheduleMeta());
  const [filters, setFilters] = useState({ movie: '', date: '', dayPart: '', place: '' });
  const [selectedScreeningId, setSelectedScreeningId] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [ticketCount, setTicketCount] = useState(5);
  const [category, setCategory] = useState('adult');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedScreening = data.screenings.find((screening) => Number(screening.id) === Number(selectedScreeningId));
  const selectedHall = selectedScreening ? getScreeningHall(selectedScreening, data.halls) : null;
  const selectedMovie = selectedScreening ? getScreeningMovie(selectedScreening, data.movies) : null;
  const selectedHallConfig = selectedHall ? hallConfigs[selectedHall.id] || {} : {};
  const selectedSeatsAll = selectedHall ? generateSeats(getHallEffectiveCapacity(selectedHall, hallConfigs)) : [];
  const takenSeats = selectedScreening ? getTakenSeats(selectedScreening.id, reservations) : [];
  const total = calculateTotal(category, selectedSeats, selectedHallConfig);

  const myReservations = reservations.filter(
    (reservation) => Number(reservation.userId) === Number(auth.user?.id) && reservation.status !== 'cancelled'
  );

  const places = useMemo(() => {
    const values = data.screenings.map((screening) => screening.place || getScreeningHall(screening, data.halls)?.name).filter(Boolean);
    return [...new Set(values)];
  }, [data.screenings, data.halls]);

  const scheduleDates = useMemo(() => availableScheduleDates(), []);

  const filteredScreenings = useMemo(() => {
    const movieQuery = normalizeSearchText(filters.movie);

    return data.screenings.filter((screening) => {
      const movie = getScreeningMovie(screening, data.movies);
      const hall = getScreeningHall(screening, data.halls);
      const movieText = normalizeSearchText(`${movie?.name || ''} ${movie?.description || ''}`);
      const placeText = screening.place || hall?.name || '';
      const dateText = getScreeningDate(screening, scheduleMeta);

      if (movieQuery && !movieText.includes(movieQuery)) return false;
      if (filters.date && dateText !== filters.date) return false;
      if (filters.dayPart && getDayPart(screening.time) !== filters.dayPart) return false;
      if (filters.place && placeText !== filters.place) return false;

      return true;
    });
  }, [data.screenings, data.movies, data.halls, filters, scheduleMeta]);

  async function loadHomeData() {
    setError('');
    setLoading(true);
    try {
      const [movies, halls, screenings] = await Promise.all([
        apiRequest('/movie/', {}, auth.token),
        apiRequest('/hall/', {}, auth.token),
        apiRequest('/screening/', {}, auth.token),
      ]);
      setData(buildDailyCatalog({ movies, halls, screenings }));
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHomeData();
  }, [auth.token]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    }, 5000);

    function onStorage(event) {
      if ([RESERVATIONS_KEY, HALL_CONFIG_KEY, SCHEDULE_META_KEY].includes(event.key)) {
        setReservations(getReservations());
        setHallConfigs(getHallConfigs());
        setScheduleMeta(getScheduleMeta());
      }
    }

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    setSelectedSeats([]);
  }, [selectedScreeningId]);

  if (!isRegularUser(auth)) {
    return (
      <main className="content">
        <section className="card">
          <h2>Nincs jogosultság jegyfoglaláshoz</h2>
          <p>Jegyet csak <strong>felhasznalo</strong> szerepkörű felhasználó foglalhat. Az admin és a pénztáros nem tud jegyet foglalni.</p>
        </section>
      </main>
    );
  }

  function selectScreening(screening) {
    setSelectedScreeningId(screening.id);
    setMessage('');
    setError('');
  }

  function autoSelectSeats(screening = selectedScreening) {
    if (!screening) return;
    const hall = getScreeningHall(screening, data.halls);
    const freeSeats = getFreeSeats(screening.id, hall, reservations, hallConfigs);
    const requested = Math.max(1, Number(ticketCount) || 1);

    if (freeSeats.length < requested) {
      setError(`Nincs elég szabad hely. Kért: ${requested}, szabad: ${freeSeats.length}.`);
      return;
    }

    setSelectedSeats(freeSeats.slice(0, requested));
    setError('');
  }

  function toggleSeat(seat) {
    const requested = normalizeTicketCount(ticketCount, getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free || 1);
    setSelectedSeats((current) => {
      if (current.includes(seat)) return current.filter((item) => item !== seat);
      if (current.length >= requested) {
        setError(`Már kiválasztottad a kért ${requested} jegyet. Növeld a jegyek számát, vagy törölj egy kijelölést.`);
        return current;
      }
      return [...current, seat];
    });
  }

  function createTicketOrder(orderType = 'reserved') {
    setError('');
    setMessage('');

    if (!isRegularUser(auth)) {
      setError('Jegyet csak felhasznalo szerepkörű felhasználó foglalhat vagy vásárolhat. Admin és pénztáros nem foglalhat és nem vásárolhat jegyet.');
      return;
    }

    if (!selectedScreening || !selectedHall || !selectedMovie) {
      setError('Előbb válassz vetítést.');
      return;
    }

    const requested = normalizeTicketCount(ticketCount, getAvailabilitySummary(selectedScreening, selectedHall, getReservations(), getHallConfigs()).free || 1);
    const availability = getAvailabilitySummary(selectedScreening, selectedHall, getReservations(), getHallConfigs());
    if (availability.soldOut || availability.free < requested) {
      setReservations(getReservations());
      setError(`Erre a vetítésre már nincs elég szabad hely. Kért: ${requested}, szabad: ${availability.free}.`);
      return;
    }

    if (selectedSeats.length === 0) {
      setError('Válassz legalább 1 helyet, vagy használd az automatikus helyválasztást.');
      return;
    }

    if (selectedSeats.length !== requested) {
      setError(`Pont ${requested} helyet kell kijelölni. Most kijelölve: ${selectedSeats.length}.`);
      return;
    }

    const freeSeatsNow = new Set(getFreeSeats(selectedScreening.id, selectedHall, getReservations(), getHallConfigs()));
    const conflictSeat = selectedSeats.find((seat) => !freeSeatsNow.has(seat));
    if (conflictSeat) {
      setReservations(getReservations());
      setError(`A(z) ${conflictSeat} hely közben foglalt vagy lezárt lett. Frissítettem a helyeket.`);
      return;
    }

    const activeReservations = getReservations();
    const hallConfig = getHallConfigs()[selectedHall.id] || {};
    const totalPrice = calculateTotal(category, selectedSeats, hallConfig);
    const now = new Date().toISOString();
    const paid = orderType === 'paid';

    const newTicketOrder = makeTicketOrder({
      auth,
      selectedScreening,
      selectedMovie,
      selectedHall,
      selectedSeats,
      category,
      status: paid ? 'paid' : 'reserved',
      paymentMethod: paid ? 'online kártyás fizetés' : 'pénztárban fizetendő',
      buyerName: getDisplayUser(auth)?.name,
      source: 'registered-user',
      scheduleMeta,
    });

    const next = [...activeReservations, newTicketOrder];
    saveReservations(next);
    setReservations(next);
    setSelectedSeats([]);

    if (paid) {
      setMessage(`Sikeres jegyvásárlás. Jegykód: ${newTicketOrder.code}. Fizetve: ${newTicketOrder.total} Ft.`);
    } else {
      setMessage(`Foglalás létrejött. Foglalási kód: ${newTicketOrder.code}. Fizetendő a pénztárnál: ${newTicketOrder.total} Ft.`);
    }
  }

  function createReservation() {
    createTicketOrder('reserved');
  }

  function createPurchase() {
    createTicketOrder('paid');
  }

  function cancelMyReservation(reservationId) {
    const target = getReservations().find((reservation) => reservation.id === reservationId);
    if (!target) {
      setError('Nem található ez a jegy vagy foglalás.');
      return;
    }
    if (!canCancelTicketOrder(target)) {
      setError('A jegy vagy foglalás már nem törölhető, mert a vetítés kezdete előtt kevesebb mint 4 óra van hátra.');
      return;
    }
    const next = getReservations().map((reservation) => (
      reservation.id === reservationId
        ? {
            ...reservation,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            refundStatus: reservation.status === 'paid' ? 'visszatérítés szükséges' : 'nem volt fizetve',
          }
        : reservation
    ));
    saveReservations(next);
    setReservations(next);
    setMessage(target.status === 'paid' ? 'Megvásárolt jegy törölve, a helyek felszabadultak. Visszatérítés jelölve.' : 'Foglalás törölve, a helyek felszabadultak.');
  }

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Műsorrend böngészése, jegyfoglalás és jegyvásárlás</h2>
          <p>A műsorrend film, dátum, napszak és mozihelyszín szerint szűrhető. A foglalási állapot 5 másodpercenként frissül, és a rendszer nem enged több jegyet, mint ahány szabad szék van az adott teremben.</p>
        </div>
        <button onClick={loadHomeData}>Frissítés</button>
      </section>

      <Message message={error} type="error" />
      <Message message={message} type="success" />

      {loading ? <p>Adatok betöltése...</p> : (
        <>
          <section className="card">
            <h3>Szűrés</h3>
            <div className="grid-form">
              <label>
                Film címe vagy leírása
                <input
                  type="search"
                  value={filters.movie}
                  onChange={(e) => setFilters({ ...filters, movie: e.target.value })}
                  placeholder="Pl. Dune, Avatar, sci-fi..."
                />
              </label>
              <label>
                Dátum
                <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
              </label>
              <label>
                Napszak
                <select value={filters.dayPart} onChange={(e) => setFilters({ ...filters, dayPart: e.target.value })}>
                  <option value="">Mindegy</option>
                  <option value="délelőtt">Délelőtt</option>
                  <option value="délután">Délután</option>
                  <option value="este">Este</option>
                </select>
              </label>
              <label>
                Mozihelyszín / terem
                <select value={filters.place} onChange={(e) => setFilters({ ...filters, place: e.target.value })}>
                  <option value="">Mindegy</option>
                  {places.map((place) => <option key={place} value={place}>{place}</option>)}
                </select>
              </label>
            </div>
            <div className="quick-date-row">
              <button type="button" className={!filters.date ? 'active' : ''} onClick={() => setFilters({ ...filters, date: '' })}>Minden dátum</button>
              {scheduleDates.slice(0, 10).map((dateValue) => (
                <button key={dateValue} type="button" className={filters.date === dateValue ? 'active' : ''} onClick={() => setFilters({ ...filters, date: dateValue })}>{formatDateHu(dateValue)}</button>
              ))}
            </div>
          </section>

          <section className="cards-grid">
            {filteredScreenings.length === 0 ? <p>Nincs találat. Válassz másik dátumot, vagy töröld a dátumszűrést.</p> : filteredScreenings.map((screening) => {
              const movie = getScreeningMovie(screening, data.movies);
              const hall = getScreeningHall(screening, data.halls);
              const availability = getAvailabilitySummary(screening, hall, reservations, hallConfigs);
              const info = getScheduleInfo(screening.id, scheduleMeta);

              return (
                <article key={screening.id} className={`screening-card ${Number(selectedScreeningId) === Number(screening.id) ? 'selected-card' : ''} ${availability.soldOut ? 'sold-out' : ''}`}>
                  <div className="card-title-row">
                    <h3>{movie?.name || `Film #${screening.movie_id}`}</h3>
                    <span className={`badge ${availability.soldOut ? 'danger-badge' : availability.almostSoldOut ? 'warning-badge' : ''}`}>{availability.soldOut ? 'Elfogyott' : `${getScreeningDate(screening, scheduleMeta)} · ${timeToText(screening.time)} · ${getDayPart(screening.time)}`}</span>
                  </div>
                  <p className="muted">{movie?.description || 'Nincs leírás.'}</p>
                  <p><strong>Hely:</strong> {screening.place || hall?.name || '-'} · <strong>Terem:</strong> {hall?.name || '-'}</p>
                  <p><strong>Szabad hely:</strong> {availability.free} / {availability.capacity} · <strong>Foglalt:</strong> {availability.taken} · <strong>Lezárt:</strong> {availability.closed}</p>
                  <div className="capacity-meter"><span style={{ width: `${availability.occupiedPercent}%` }} /></div>
                  <p><strong>Teljes filmidő reklámokkal:</strong> {info.total} perc · <strong>Terem foglalva takarítással:</strong> {info.roomBlocked} perc</p>
                  <button className="primary" disabled={availability.soldOut} onClick={() => selectScreening(screening)}>{availability.soldOut ? 'Nincs több szék' : 'Erre foglalok / vásárolok'}</button>
                </article>
              );
            })}
          </section>

          {selectedScreening && selectedHall && (
            <section className="card">
              <div className="card-title-row">
                <h3>Jegyfoglalás / jegyvásárlás: {selectedMovie?.name} · {getScreeningDate(selectedScreening, scheduleMeta)} {timeToText(selectedScreening.time)}</h3>
                <span className="badge">Max. teremkapacitás: {MAX_HALL_CAPACITY}</span>
              </div>

              <div className="grid-form">
                <label>
                  Jegyek száma
                  <input
                    type="number"
                    min="1"
                    max={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free || 1}
                    value={ticketCount}
                    onChange={(e) => { const max = getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free || 1; const next = normalizeTicketCount(e.target.value, max); setTicketCount(next); setSelectedSeats((current) => current.slice(0, next)); }}
                  />
                </label>
                <label>
                  Kategória
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.entries(ticketCategories).map(([key, item]) => (
                      <option key={key} value={key}>{item.label} · {item.price} Ft/fő</option>
                    ))}
                  </select>
                </label>
                <div className="stat-box">
                  <span>Kiválasztva</span>
                  <strong>{selectedSeats.length} jegy</strong>
                </div>
                <div className="stat-box">
                  <span>Fizetendő</span>
                  <strong>{total} Ft</strong>
                </div>
              </div>

              <div className="ticket-summary">
                <span>Terem kapacitása: <strong>{getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).capacity}</strong></span>
                <span>Szabad hely: <strong>{getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).free}</strong></span>
                <span>Terem állapota: <strong>{getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut ? 'Elfogyott' : 'Foglalható'}</strong></span>
                <span>Kért jegy: <strong>{ticketCount}</strong></span>
                <span>Kijelölve: <strong>{selectedSeats.length}</strong></span>
              </div>

              <div className="legend">
                <span><i className="legend-free" /> Szabad</span>
                <span><i className="legend-selected" /> Kiválasztott</span>
                <span><i className="legend-taken" /> Foglalt</span>
                <span><i className="legend-vip" /> VIP +600 Ft</span>
                <span><i className="legend-closed" /> Lezárt</span>
              </div>

              <SeatGrid
                seats={selectedSeatsAll}
                selectedSeats={selectedSeats}
                takenSeats={takenSeats}
                vipSeats={selectedHallConfig.vipSeats || []}
                closedSeats={selectedHallConfig.closedSeats || []}
                onToggleSeat={toggleSeat}
              />

              <div className="form-actions">
                <button type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut} onClick={() => autoSelectSeats()}>Automatikus helyválasztás {ticketCount} jegyre</button>
                <button type="button" onClick={() => setSelectedSeats([])}>Kijelölés törlése</button>
                <button type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut} onClick={createReservation}>Foglalás létrehozása</button>
                <button className="primary" type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut} onClick={createPurchase}>Azonnali jegyvásárlás</button>
              </div>

              <p className="muted small">
                Példa: ha 5 felnőtt jegyet választasz, az alapár {5 * ticketCategories.adult.price} Ft. VIP helyenként +600 Ft. A foglalás pénztárban fizetendő, a vásárlás azonnal fizetett állapotba kerül.
              </p>
            </section>
          )}

          <section className="card">
            <h3>Saját foglalásaim és megvásárolt jegyeim</h3>
            <DataTable
              columns={[
                ['code', 'Foglalási kód'],
                ['movieName', 'Film'],
                ['hallName', 'Terem'],
                ['screeningDate', 'Dátum'],
                ['time', 'Idő'],
                ['seats', 'Helyek'],
                ['categoryLabel', 'Kategória'],
                ['total', 'Összeg'],
                ['paymentMethod', 'Fizetés'],
                ['status', 'Állapot'],
              ]}
              rows={myReservations.map((reservation) => ({
                ...reservation,
                seats: reservation.seats.join(', '),
                time: timeToText(reservation.time),
                statusRaw: reservation.status,
                status: getOrderStatusLabel(reservation),
                paymentMethod: reservation.paymentMethod || (reservation.status === 'paid' ? 'fizetve' : 'pénztárban fizetendő'),
                canCancel: canCancelTicketOrder(reservation),
                cancelInfo: cancelWindowText(reservation),
              }))}
              actions={(row) => (
                ['reserved', 'paid'].includes(row.statusRaw)
                  ? <><button className="danger" disabled={!row.canCancel} onClick={() => cancelMyReservation(row.id)}>{row.statusRaw === 'paid' ? 'Jegy törlése' : 'Foglalás törlése'}</button><span className="muted small">{row.cancelInfo}</span></>
                  : <span className="muted small">Nincs művelet</span>
              )}
            />
          </section>
        </>
      )}
    </main>
  );
}

function CashierPage({ auth }) {
  const [data, setData] = useState({ movies: [], halls: [], screenings: [] });
  const [reservations, setReservations] = useState(getReservations());
  const [hallConfigs, setHallConfigs] = useState(getHallConfigs());
  const [scheduleMeta, setScheduleMeta] = useState(getScheduleMeta());
  const [code, setCode] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [newSeats, setNewSeats] = useState([]);
  const [cashierSale, setCashierSale] = useState({ screeningId: '', customerName: '', email: '', phone: '', ticketCount: 1, category: 'adult' });
  const [cashierSaleSeats, setCashierSaleSeats] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedReservation = reservations.find((reservation) => reservation.code === selectedCode && reservation.status !== 'cancelled');
  const selectedScreening = selectedReservation ? data.screenings.find((screening) => Number(screening.id) === Number(selectedReservation.screeningId)) : null;
  const selectedHall = selectedScreening ? getScreeningHall(selectedScreening, data.halls) : null;
  const selectedHallConfig = selectedHall ? hallConfigs[selectedHall.id] || {} : {};
  const seatCount = selectedReservation?.seats?.length || 0;
  const seatsAll = selectedHall ? generateSeats(getHallEffectiveCapacity(selectedHall, hallConfigs)) : [];
  const takenSeats = selectedScreening
    ? getTakenSeats(selectedScreening.id, reservations).filter((seat) => !selectedReservation?.seats?.includes(seat))
    : [];

  const cashierSelectedScreening = data.screenings.find((screening) => Number(screening.id) === Number(cashierSale.screeningId));
  const cashierSelectedHall = cashierSelectedScreening ? getScreeningHall(cashierSelectedScreening, data.halls) : null;
  const cashierSelectedMovie = cashierSelectedScreening ? getScreeningMovie(cashierSelectedScreening, data.movies) : null;
  const cashierHallConfig = cashierSelectedHall ? hallConfigs[cashierSelectedHall.id] || {} : {};
  const cashierSeatsAll = cashierSelectedHall ? generateSeats(getHallEffectiveCapacity(cashierSelectedHall, hallConfigs)) : [];
  const cashierTakenSeats = cashierSelectedScreening ? getTakenSeats(cashierSelectedScreening.id, reservations) : [];
  const cashierTotal = calculateTotal(cashierSale.category, cashierSaleSeats, cashierHallConfig);

  async function loadCashierData() {
    setError('');
    try {
      const [movies, halls, screenings] = await Promise.all([
        apiRequest('/movie/', {}, auth.token),
        apiRequest('/hall/', {}, auth.token),
        apiRequest('/screening/', {}, auth.token),
      ]);
      setData(buildDailyCatalog({ movies, halls, screenings }));
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCashierData();
  }, [auth.token]);

  function findReservation(event) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    const found = getReservations().find((reservation) => reservation.code === normalized && reservation.status !== 'cancelled');
    setReservations(getReservations());
    setSelectedCode(found?.code || '');
    setNewSeats([]);
    setMessage('');
    setError(found ? '' : 'Nincs ilyen aktív foglalási kód.');
  }

  function updateReservation(codeToUpdate, updater) {
    const next = getReservations().map((reservation) => reservation.code === codeToUpdate ? updater(reservation) : reservation);
    saveReservations(next);
    setReservations(next);
  }

  function finalizeReservation() {
    if (!selectedReservation) return;
    updateReservation(selectedReservation.code, (reservation) => ({ ...reservation, status: 'paid', paidAt: new Date().toISOString() }));
    setMessage('A foglalás véglegesítve és fizetett állapotba került.');
  }

  function voidReservation() {
    if (!selectedReservation) return;
    updateReservation(selectedReservation.code, (reservation) => ({ ...reservation, status: 'cancelled', cancelledAt: new Date().toISOString(), cashier: auth.user?.name }));
    setSelectedCode('');
    setNewSeats([]);
    setMessage('Sztornó megtörtént, a helyek felszabadultak.');
  }

  function releaseReservation() {
    voidReservation();
  }

  function toggleNewSeat(seat) {
    setNewSeats((current) => {
      if (current.includes(seat)) return current.filter((item) => item !== seat);
      if (current.length >= seatCount) return current;
      return [...current, seat];
    });
  }

  function changeSeats() {
    if (!selectedReservation) return;
    if (newSeats.length !== seatCount) {
      setError(`Pont ${seatCount} új helyet kell kijelölni.`);
      return;
    }
    const hallConfig = getHallConfigs()[selectedHall.id] || {};
    updateReservation(selectedReservation.code, (reservation) => ({
      ...reservation,
      seats: newSeats,
      total: calculateTotal(reservation.category, newSeats, hallConfig),
      changedAt: new Date().toISOString(),
    }));
    setMessage('Helycsere megtörtént.');
    setError('');
    setNewSeats([]);
  }


  function toggleCashierSaleSeat(seat) {
    const requested = normalizeTicketCount(cashierSale.ticketCount, getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).free || 1);
    setCashierSaleSeats((current) => {
      if (current.includes(seat)) return current.filter((item) => item !== seat);
      if (current.length >= requested) {
        setError(`Már kiválasztottad a kért ${requested} jegyet. Növeld a jegyek számát, vagy törölj egy kijelölést.`);
        return current;
      }
      return [...current, seat];
    });
  }

  function autoSelectCashierSaleSeats() {
    if (!cashierSelectedScreening || !cashierSelectedHall) return;
    const freeSeats = getFreeSeats(cashierSelectedScreening.id, cashierSelectedHall, getReservations(), getHallConfigs());
    const requested = Math.max(1, Number(cashierSale.ticketCount) || 1);
    if (freeSeats.length < requested) {
      setError(`Nincs elég szabad hely. Kért: ${requested}, szabad: ${freeSeats.length}.`);
      return;
    }
    setCashierSaleSeats(freeSeats.slice(0, requested));
    setError('');
  }

  function createCashierSale() {
    setError('');
    setMessage('');
    if (!isCashierOnly(auth)) {
      setError('Helyszíni jegyeladást csak pénztáros szerepkörű felhasználó végezhet.');
      return;
    }
    if (!cashierSelectedScreening || !cashierSelectedHall || !cashierSelectedMovie) {
      setError('Előbb válassz vetítést a helyszíni vásárláshoz.');
      return;
    }
    if (!cashierSale.email || !cashierSale.phone) {
      setError('Helyszíni vásárlásnál is add meg a vevő e-mail címét és telefonszámát.');
      return;
    }
    const requested = normalizeTicketCount(cashierSale.ticketCount, getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, getReservations(), getHallConfigs()).free || 1);
    const availability = getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, getReservations(), getHallConfigs());
    if (availability.soldOut || availability.free < requested) {
      setReservations(getReservations());
      setError(`Erre a vetítésre már nincs elég szabad hely. Kért: ${requested}, szabad: ${availability.free}.`);
      return;
    }
    if (cashierSaleSeats.length === 0) {
      setError('Válassz legalább 1 helyet.');
      return;
    }
    if (cashierSaleSeats.length !== requested) {
      setError(`Pont ${requested} helyet kell kijelölni. Most kijelölve: ${cashierSaleSeats.length}.`);
      return;
    }
    const freeSeatsNow = new Set(getFreeSeats(cashierSelectedScreening.id, cashierSelectedHall, getReservations(), getHallConfigs()));
    const conflictSeat = cashierSaleSeats.find((seat) => !freeSeatsNow.has(seat));
    if (conflictSeat) {
      setReservations(getReservations());
      setError(`A(z) ${conflictSeat} hely közben foglalt vagy lezárt lett.`);
      return;
    }
    const order = makeTicketOrder({
      auth: null,
      selectedScreening: cashierSelectedScreening,
      selectedMovie: cashierSelectedMovie,
      selectedHall: cashierSelectedHall,
      selectedSeats: cashierSaleSeats,
      category: cashierSale.category,
      status: 'paid',
      paymentMethod: 'pénztári fizetés',
      buyerName: cashierSale.customerName || 'Helyszíni vásárló',
      guestEmail: cashierSale.email,
      guestPhone: cashierSale.phone,
      source: 'cashier-sale',
      scheduleMeta,
      cashierName: auth.user?.name,
    });
    const next = [...getReservations(), order];
    saveReservations(next);
    setReservations(next);
    setCashierSaleSeats([]);
    setCashierSale({ screeningId: '', customerName: '', email: '', phone: '', ticketCount: 1, category: 'adult' });
    setMessage(`Pénztári jegyvásárlás rögzítve. Jegykód: ${order.code}. Fizetve: ${order.total} Ft.`);
  }

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Pénztáros felület</h2>
          <p>Foglalási kód alapján véglegesítés, helycsere, sztornó és helyfelszabadítás.</p>
        </div>
        <button onClick={loadCashierData}>Frissítés</button>
      </section>

      <Message message={error} type="error" />
      <Message message={message} type="success" />

      <section className="card">
        <h3>Helyszíni jegyvásárlás rögzítése</h3>
        <p className="muted">Ezt csak pénztáros használhatja: a vevő helyben fizet, a jegy azonnal fizetett állapotba kerül.</p>
        <div className="grid-form">
          <label>
            Vetítés
            <select value={cashierSale.screeningId} onChange={(e) => { setCashierSale({ ...cashierSale, screeningId: e.target.value }); setCashierSaleSeats([]); }}>
              <option value="">Válassz vetítést...</option>
              {data.screenings.map((screening) => {
                const movie = getScreeningMovie(screening, data.movies);
                const hall = getScreeningHall(screening, data.halls);
                return <option key={screening.id} value={screening.id}>{movie?.name || screening.movie_id} · {getScreeningDate(screening, scheduleMeta)} {timeToText(screening.time)} · {hall?.name || screening.place}</option>;
              })}
            </select>
          </label>
          <label>Vevő neve<input value={cashierSale.customerName} onChange={(e) => setCashierSale({ ...cashierSale, customerName: e.target.value })} /></label>
          <label>Vevő e-mail<input type="email" value={cashierSale.email} onChange={(e) => setCashierSale({ ...cashierSale, email: e.target.value })} /></label>
          <label>Vevő telefon<input value={cashierSale.phone} onChange={(e) => setCashierSale({ ...cashierSale, phone: e.target.value })} /></label>
          <label>Jegyek száma<input type="number" min="1" max={getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).free || 1} value={cashierSale.ticketCount} onChange={(e) => { const max = getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).free || 1; const next = normalizeTicketCount(e.target.value, max); setCashierSale({ ...cashierSale, ticketCount: next }); setCashierSaleSeats((current) => current.slice(0, next)); }} /></label>
          <label>Kategória<select value={cashierSale.category} onChange={(e) => setCashierSale({ ...cashierSale, category: e.target.value })}>{Object.entries(ticketCategories).map(([key, item]) => <option key={key} value={key}>{item.label} · {item.price} Ft/fő</option>)}</select></label>
          <div className="stat-box"><span>Fizetendő</span><strong>{cashierTotal} Ft</strong></div>
        </div>
        {cashierSelectedScreening && cashierSelectedHall && (
          <>
            <div className="ticket-summary">
              <span>Szabad hely: <strong>{getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).free}</strong></span>
              <span>Terem állapota: <strong>{getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).soldOut ? 'Elfogyott' : 'Eladható'}</strong></span>
              <span>Kért jegy: <strong>{cashierSale.ticketCount}</strong></span>
              <span>Kijelölve: <strong>{cashierSaleSeats.length}</strong></span>
            </div>
            <SeatGrid seats={cashierSeatsAll} selectedSeats={cashierSaleSeats} takenSeats={cashierTakenSeats} vipSeats={cashierHallConfig.vipSeats || []} closedSeats={cashierHallConfig.closedSeats || []} onToggleSeat={toggleCashierSaleSeat} />
            <div className="form-actions">
              <button type="button" disabled={getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).soldOut} onClick={autoSelectCashierSaleSeats}>Automatikus helyválasztás</button>
              <button type="button" onClick={() => setCashierSaleSeats([])}>Kijelölés törlése</button>
              <button className="primary" type="button" disabled={getAvailabilitySummary(cashierSelectedScreening, cashierSelectedHall, reservations, hallConfigs).soldOut} onClick={createCashierSale}>Pénztári vásárlás mentése</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Helyfoglalás véglegesítése foglalási kóddal</h3>
        <form className="search-bar" onSubmit={findReservation}>
          <label>
            Foglalási kód
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Pl. JM-12345-ABCDE" />
          </label>
          <button className="primary" type="submit">Keresés</button>
        </form>

        {selectedReservation && (
          <div className="reservation-details">
            <h4>{selectedReservation.movieName} · {timeToText(selectedReservation.time)}</h4>
            <p><strong>Vendég:</strong> {selectedReservation.userName} · <strong>Kód:</strong> {selectedReservation.code}</p>
            <p><strong>Helyek:</strong> {selectedReservation.seats.join(', ')} · <strong>Összeg:</strong> {selectedReservation.total} Ft · <strong>Állapot:</strong> {selectedReservation.status === 'paid' ? 'fizetve' : 'lefoglalva'}</p>
            <div className="form-actions">
              <button className="primary" onClick={finalizeReservation}>Véglegesítés / jegyek kiadása</button>
              <button onClick={releaseReservation}>Helyfelszabadítás</button>
              <button className="danger" onClick={voidReservation}>Sztornó</button>
            </div>
          </div>
        )}
      </section>

      {selectedReservation && selectedHall && (
        <section className="card">
          <h3>Helycsere</h3>
          <p className="muted">Jelölj ki pontosan {seatCount} új szabad helyet. A régi helyek ilyenkor felszabadulnak.</p>
          <SeatGrid
            seats={seatsAll}
            selectedSeats={newSeats}
            takenSeats={takenSeats}
            vipSeats={selectedHallConfig.vipSeats || []}
            closedSeats={selectedHallConfig.closedSeats || []}
            onToggleSeat={toggleNewSeat}
          />
          <div className="form-actions">
            <button className="primary" onClick={changeSeats}>Helycsere mentése</button>
            <button onClick={() => setNewSeats([])}>Kijelölés törlése</button>
          </div>
        </section>
      )}

      <section className="card">
        <h3>Terem- és műsorinformáció</h3>
        <DataTable
          columns={[
            ['movie', 'Film'],
            ['time', 'Kezdés'],
            ['hall', 'Terem'],
            ['free', 'Szabad hely'],
            ['occupied', 'Foglalt'],
            ['runtime', 'Film reklámokkal'],
            ['blocked', 'Terem foglalva'],
          ]}
          rows={data.screenings.map((screening) => {
            const movie = getScreeningMovie(screening, data.movies);
            const hall = getScreeningHall(screening, data.halls);
            const availability = getAvailabilitySummary(screening, hall, reservations, hallConfigs);
            const info = getScheduleInfo(screening.id, scheduleMeta);
            return {
              id: screening.id,
              movie: movie?.name || `Film #${screening.movie_id}`,
              time: timeToText(screening.time),
              hall: hall?.name || screening.place,
              free: availability.soldOut ? 'Elfogyott' : `${availability.free} / ${availability.capacity}`,
              occupied: availability.taken,
              runtime: `${info.total} perc`,
              blocked: `${info.roomBlocked} perc`,
            };
          })}
        />
      </section>
    </main>
  );
}

function ResourceBlock({ title, config, rows }) {
  const [searchText, setSearchText] = useState('');
  const filteredRows = useMemo(
    () => filterRows(rows, searchText, config.search?.fields),
    [rows, searchText, config.search]
  );

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>{title}</h3>
        {config.search && <span className="muted">Találatok: {filteredRows.length} / {rows.length}</span>}
      </div>

      {config.search && (
        <div className="search-bar">
          <label>
            Film keresése
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={config.search.placeholder}
            />
          </label>
          {searchText && <button type="button" onClick={() => setSearchText('')}>Keresés törlése</button>}
        </div>
      )}

      <DataTable columns={config.columns} rows={filteredRows} />
    </section>
  );
}

function AdminPanel({ auth }) {
  const token = auth.token;
  const resourceKeys = useMemo(() => Object.keys(resources), []);
  const [active, setActive] = useState('movies');
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(resources.movies.emptyForm || {});
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const config = resources[active] || null;
  const filteredRows = useMemo(
    () => config ? filterRows(rows, searchText, config.search?.fields) : [],
    [rows, searchText, config]
  );

  async function loadRows() {
    if (!config) {
      setRows([]);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await apiRequest(config.endpoint, {}, token);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setEditingId(null);
    setMessage('');
    setError('');
    setSearchText('');

    if (!config) {
      setRows([]);
      setForm({});
      return;
    }

    setForm(config.emptyForm || {});
    loadRows();
  }, [active, config]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const payload = normalizePayload(form);

      if (active === 'halls' && Number(payload.capacity) > MAX_HALL_CAPACITY) {
        throw new Error(`Egy teremben maximum ${MAX_HALL_CAPACITY} hely lehet, ezért nem adhatsz meg ennél nagyobb férőhelyet.`);
      }

      const method = editingId ? 'PUT' : 'POST';
      const path = editingId ? `${config.endpoint}${editingId}` : config.endpoint;
      await apiRequest(path, { method, body: JSON.stringify(payload) }, token);
      setMessage(editingId ? 'Sikeres módosítás.' : 'Sikeres létrehozás.');
      setForm(config.emptyForm || {});
      setEditingId(null);
      await loadRows();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(row) {
    const id = row[config.idField];
    const confirmed = window.confirm(`Biztosan törlöd? ID: ${id}`);
    if (!confirmed) return;

    setError('');
    setMessage('');
    try {
      await apiRequest(`${config.endpoint}${id}`, { method: 'DELETE' }, token);
      setMessage('Sikeres törlés.');
      await loadRows();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(row) {
    const nextForm = {};
    Object.keys(config.emptyForm || {}).forEach((key) => {
      nextForm[key] = row[key] ?? '';
    });
    setForm(nextForm);
    setEditingId(row[config.idField]);
    setMessage('');
    setError('');
  }

  async function ticketAction(path, successText) {
    setError('');
    setMessage('');
    try {
      await apiRequest(path, { method: path.endsWith('/cancel') ? 'DELETE' : 'POST' }, token);
      setMessage(successText);
      await loadRows();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Admin kezelő</h2>
          <p>CRUD műveletek, 50 férőhelyes korlát, showtime ütemezés és terem-konfigurátor.</p>
        </div>
        <button onClick={loadRows}>Frissítés</button>
      </section>

      <div className="resource-tabs">
        {resourceKeys.map((key) => (
          <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{resources[key].label}</button>
        ))}
        <button className={active === 'schedule' ? 'active' : ''} onClick={() => setActive('schedule')}>Showtime ütemezés</button>
        <button className={active === 'hall-config' ? 'active' : ''} onClick={() => setActive('hall-config')}>Terem-konfigurátor</button>
      </div>

      {active === 'schedule' ? <ScheduleEditor auth={auth} /> : active === 'hall-config' ? <HallConfigurator auth={auth} /> : (
        <>
          <Message message={error} type="error" />
          <Message message={message} type="success" />

          {!config.readOnly && (
            <section className="card">
              <h3>{editingId ? `${config.label} módosítása` : `${config.label} létrehozása`}</h3>
              {config.createOnly && <p className="muted">Ennél a backendnél csak létrehozás van, általános PUT/DELETE nincs.</p>}
              {active === 'halls' && <p className="muted">Frontend szabály: egy teremben legfeljebb {MAX_HALL_CAPACITY} hely lehet.</p>}
              <form onSubmit={handleSubmit} className="grid-form">
                {config.fields.map(([key, label, type]) => (
                  <label key={key}>
                    {label}
                    {type === 'textarea' ? (
                      <textarea value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                    ) : (
                      <input
                        type={type}
                        min={type === 'number' ? '0' : undefined}
                        max={key === 'capacity' ? MAX_HALL_CAPACITY : undefined}
                        value={form[key] ?? ''}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        required={key !== 'user_id' && key !== 'description'}
                      />
                    )}
                  </label>
                ))}
                <div className="form-actions">
                  <button className="primary" type="submit">{editingId ? 'Módosítás' : 'Létrehozás'}</button>
                  {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(config.emptyForm || {}); }}>Mégse</button>}
                </div>
              </form>
            </section>
          )}

          <section className="card">
            <div className="card-title-row">
              <h3>{config.label} táblázat</h3>
              {config.search && <span className="muted">Találatok: {filteredRows.length} / {rows.length}</span>}
            </div>

            {config.search && (
              <div className="search-bar">
                <label>
                  Film keresése
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={config.search.placeholder}
                  />
                </label>
                {searchText && <button type="button" onClick={() => setSearchText('')}>Keresés törlése</button>}
              </div>
            )}

            {loading ? <p>Betöltés...</p> : (
              <DataTable
                columns={config.columns}
                rows={filteredRows}
                actions={!config.readOnly ? (row) => (
                  <>
                    {!config.createOnly && <button onClick={() => startEdit(row)}>Szerkesztés</button>}
                    {!config.noDelete && <button className="danger" onClick={() => handleDelete(row)}>Törlés</button>}
                    {active === 'tickets' && (
                      <>
                        <button onClick={() => ticketAction(`/ticket/${row.id}/release`, 'Jegy felszabadítva.')}>Release</button>
                        <button className="danger" onClick={() => ticketAction(`/ticket/${row.id}/cancel`, 'Jegy lemondva.')}>Cancel</button>
                      </>
                    )}
                  </>
                ) : null}
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}

function ScheduleEditor({ auth }) {
  const [data, setData] = useState({ movies: [], halls: [], screenings: [] });
  const [meta, setMeta] = useState(getScheduleMeta());
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(defaultScheduleMeta);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    try {
      const [movies, halls, screenings] = await Promise.all([
        apiRequest('/movie/', {}, auth.token),
        apiRequest('/hall/', {}, auth.token),
        apiRequest('/screening/', {}, auth.token),
      ]);
      setData({ movies, halls, screenings });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, [auth.token]);

  useEffect(() => {
    if (!selectedId) return;
    setForm({ ...defaultScheduleMeta, ...(meta[selectedId] || {}) });
  }, [selectedId, meta]);

  function saveMeta(event) {
    event.preventDefault();
    if (!selectedId) {
      setError('Válassz vetítést.');
      return;
    }
    const next = {
      ...meta,
      [selectedId]: {
        movieRuntime: Number(form.movieRuntime),
        ads: Number(form.ads),
        trailers: Number(form.trailers),
        cleaning: Number(form.cleaning),
      },
    };
    saveScheduleMeta(next);
    setMeta(next);
    setMessage('Showtime ütemezés mentve.');
    setError('');
  }

  const rows = data.screenings.map((screening) => {
    const movie = getScreeningMovie(screening, data.movies);
    const hall = getScreeningHall(screening, data.halls);
    const info = getScheduleInfo(screening.id, meta);
    return {
      id: screening.id,
      movie: movie?.name || `Film #${screening.movie_id}`,
      hall: hall?.name || screening.place,
      date: getScreeningDate(screening, meta),
      start: timeToText(screening.time),
      movieRuntime: `${info.movieRuntime} perc`,
      ads: `${info.ads} perc`,
      trailers: `${info.trailers} perc`,
      cleaning: `${info.cleaning} perc`,
      total: `${info.total} perc`,
      blocked: `${info.roomBlocked} perc`,
    };
  });

  return (
    <>
      <Message message={error} type="error" />
      <Message message={message} type="success" />
      <section className="card">
        <h3>Showtime ütemezés</h3>
        <p className="muted">Itt állítható a vetítés dátuma, a film hossza, reklám, előzetes és takarítási idő. A backend vetítés kezdési időpontját az Admin kezelő / Vetítések táblában tudod módosítani.</p>
        <form className="grid-form" onSubmit={saveMeta}>
          <label>
            Vetítés
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Válassz...</option>
              {data.screenings.map((screening) => {
                const movie = getScreeningMovie(screening, data.movies);
                const hall = getScreeningHall(screening, data.halls);
                return <option key={screening.id} value={screening.id}>{movie?.name || screening.movie_id} · {timeToText(screening.time)} · {hall?.name || screening.place}</option>;
              })}
            </select>
          </label>
          <label>Vetítés dátuma<input type="date" value={form.date || todayDateValue()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Film hossza percben<input type="number" min="1" value={form.movieRuntime} onChange={(e) => setForm({ ...form, movieRuntime: e.target.value })} /></label>
          <label>Reklám perc<input type="number" min="0" value={form.ads} onChange={(e) => setForm({ ...form, ads: e.target.value })} /></label>
          <label>Előzetes perc<input type="number" min="0" value={form.trailers} onChange={(e) => setForm({ ...form, trailers: e.target.value })} /></label>
          <label>Takarítás perc<input type="number" min="0" value={form.cleaning} onChange={(e) => setForm({ ...form, cleaning: e.target.value })} /></label>
          <div className="form-actions"><button className="primary" type="submit">Mentés</button></div>
        </form>
      </section>
      <section className="card">
        <h3>Aktuális ütemezési táblázat</h3>
        <DataTable
          columns={[
            ['movie', 'Film'],
            ['hall', 'Terem'],
            ['date', 'Dátum'],
            ['start', 'Kezdés'],
            ['movieRuntime', 'Film'],
            ['ads', 'Reklám'],
            ['trailers', 'Előzetes'],
            ['cleaning', 'Takarítás'],
            ['total', 'Film reklámokkal'],
            ['blocked', 'Terem foglalva'],
          ]}
          rows={rows}
        />
      </section>
    </>
  );
}

function HallConfigurator({ auth }) {
  const [halls, setHalls] = useState([]);
  const [configs, setConfigs] = useState(getHallConfigs());
  const [selectedHallId, setSelectedHallId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedHall = halls.find((hall) => Number(hall.id) === Number(selectedHallId));
  const selectedConfig = selectedHall ? configs[selectedHall.id] || {} : {};
  const capacity = selectedHall ? getHallEffectiveCapacity(selectedHall, configs) : MAX_HALL_CAPACITY;
  const seats = generateSeats(capacity);

  async function loadHalls() {
    try {
      const data = await apiRequest('/hall/', {}, auth.token);
      setHalls(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadHalls();
  }, [auth.token]);

  function updateConfigForHall(nextConfig) {
    if (!selectedHall) return;
    const next = { ...configs, [selectedHall.id]: nextConfig };
    saveHallConfigs(next);
    setConfigs(next);
  }

  function setCapacity(value) {
    const nextCapacity = Math.max(1, Math.min(MAX_HALL_CAPACITY, Number(value) || 1));
    updateConfigForHall({ ...selectedConfig, capacity: nextCapacity });
  }

  function toggleSeatProperty(seat, property) {
    const current = new Set(selectedConfig[property] || []);
    if (current.has(seat)) current.delete(seat);
    else current.add(seat);
    updateConfigForHall({ ...selectedConfig, [property]: [...current] });
  }

  function saveConfig() {
    setMessage('Terem-konfiguráció mentve. A foglaló és pénztáros felület ezt az ülésrendet használja.');
  }

  return (
    <>
      <Message message={error} type="error" />
      <Message message={message} type="success" />
      <section className="card">
        <h3>Terem-konfigurátor</h3>
        <p className="muted">A backendben a terem csak név + férőhely adatot tárol. A VIP és lezárt helyek frontendben mentődnek.</p>
        <div className="grid-form">
          <label>
            Terem
            <select value={selectedHallId} onChange={(e) => { setSelectedHallId(e.target.value); setMessage(''); }}>
              <option value="">Válassz termet...</option>
              {halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name} · backend férőhely: {hall.capacity}</option>)}
            </select>
          </label>
          {selectedHall && (
            <label>
              Használható férőhely, max. 50
              <input type="number" min="1" max={MAX_HALL_CAPACITY} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          )}
        </div>
      </section>

      {selectedHall && (
        <section className="card">
          <div className="card-title-row">
            <h3>{selectedHall.name} ülésrend</h3>
            <span className="badge">VIP: {(selectedConfig.vipSeats || []).length} · Lezárt: {(selectedConfig.closedSeats || []).length}</span>
          </div>
          <p className="muted">Kattintás bal gombbal: VIP kapcsolása. Shift + kattintás: lezárt szék kapcsolása.</p>
          <div className="seat-grid">
            {seats.map((seat) => {
              const isVip = (selectedConfig.vipSeats || []).includes(seat);
              const isClosed = (selectedConfig.closedSeats || []).includes(seat);
              return (
                <button
                  type="button"
                  key={seat}
                  className={['seat', isVip ? 'vip' : '', isClosed ? 'closed' : ''].filter(Boolean).join(' ')}
                  onClick={(event) => toggleSeatProperty(seat, event.shiftKey ? 'closedSeats' : 'vipSeats')}
                  title="Kattintás: VIP, Shift+kattintás: lezárás"
                >
                  {seat}
                </button>
              );
            })}
          </div>
          <div className="form-actions">
            <button className="primary" onClick={saveConfig}>Konfiguráció mentése</button>
            <button onClick={() => updateConfigForHall({ capacity })}>VIP/lezárások törlése</button>
          </div>
        </section>
      )}
    </>
  );
}


function ProfilePage({ auth, setAuth }) {
  const displayUser = getDisplayUser(auth);
  const [form, setForm] = useState({
    name: displayUser.name || '',
    email: displayUser.email || '',
    phone: displayUser.phone || '',
  });
  const [message, setMessage] = useState('');

  function saveProfile(event) {
    event.preventDefault();
    const profile = { ...form };
    saveProfileOverride(auth.user.id, profile);
    const updated = { ...auth, user: { ...auth.user, ...profile } };
    saveAuth(updated);
    setAuth(updated);
    setMessage('Profiladatok mentve a frontendben. A backendben jelenleg nincs külön PUT /user/me végpont, ezért ez helyi profilfrissítés.');
  }

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Saját fiók kezelése</h2>
          <p>E-mail cím és telefonszám módosítása az értesítésekhez és visszaigazolásokhoz.</p>
        </div>
      </section>
      <Message message={message} type="success" />
      <section className="card">
        <h3>Profiladatok</h3>
        <form className="grid-form" onSubmit={saveProfile}>
          <label>Név<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Telefonszám<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
          <div className="form-actions"><button className="primary" type="submit">Profil mentése</button></div>
        </form>
      </section>
    </main>
  );
}

function getDefaultPageForRole(auth) {
  if (isRegularUser(auth)) return 'booking';
  if (isAdmin(auth)) return 'admin';
  if (isCashier(auth)) return 'cashier';
  return 'booking';
}

function App() {
  const [auth, setAuth] = useState(getSavedAuth());
  const [activePage, setActivePage] = useState(getDefaultPageForRole(getSavedAuth()));
  const [checking, setChecking] = useState(Boolean(getSavedAuth()?.token));

  useEffect(() => {
    async function verifySavedToken() {
      const saved = getSavedAuth();
      if (!saved?.token) {
        setChecking(false);
        return;
      }
      try {
        const me = await getMe(saved.token);
        const updated = { ...saved, user: me };
        saveAuth(updated);
        setAuth(updated);
        setActivePage(getDefaultPageForRole(updated));
      } catch {
        clearAuth();
        setAuth(null);
      } finally {
        setChecking(false);
      }
    }

    verifySavedToken();
  }, []);

  function handleLogin(nextAuth) {
    setAuth(nextAuth);
    setActivePage(getDefaultPageForRole(nextAuth));
  }

  function logout() {
    clearAuth();
    setAuth(null);
    setActivePage('booking');
  }

  if (checking) {
    return <main className="login-page"><section className="login-card"><p>Token ellenőrzése...</p></section></main>;
  }

  if (!auth) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const canBook = isRegularUser(auth);
  const admin = isAdmin(auth);
  const cashier = isCashierOnly(auth);
  const page = canBook && activePage === 'booking'
    ? <BookingPage auth={auth} />
    : canBook && activePage === 'profile'
      ? <ProfilePage auth={auth} setAuth={setAuth} />
    : admin && activePage === 'admin'
      ? <AdminPanel auth={auth} />
      : cashier && activePage === 'cashier'
        ? <CashierPage auth={auth} />
        : getDefaultPageForRole(auth) === 'admin'
          ? <AdminPanel auth={auth} />
          : getDefaultPageForRole(auth) === 'cashier'
            ? <CashierPage auth={auth} />
            : <BookingPage auth={auth} />;

  return (
    <>
      <Header auth={auth} activePage={activePage} setActivePage={setActivePage} onLogout={logout} />
      {page}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
