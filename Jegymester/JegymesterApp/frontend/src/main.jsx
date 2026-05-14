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
const LOCAL_MOVIES_KEY = 'jegymester_local_movies_v3';
const LOCAL_SCREENINGS_KEY = 'jegymester_local_screenings_v3';
const DELETED_SCREENING_OCCURRENCES_KEY = 'jegymester_deleted_screening_occurrences_v1';
const AUTO_SCREENING_ID_BASE = 8700000;
const PUBLIC_DAYS_AHEAD = 365;

const moviePosterByTitle = [
  { src: '/movie-posters/avatar.jpg', titles: ['avatar'] },
  { src: '/movie-posters/banana-joe.jpg', titles: ['banana joe', 'bananos joe', 'banános joe', 'bannanos joe'] },
  { src: '/movie-posters/batman.jpg', titles: ['batman'] },
  { src: '/movie-posters/boomerang.jpg', titles: ['boomerang'] },
  { src: '/movie-posters/dune.jpg', titles: ['dune', 'dűne'] },
  { src: '/movie-posters/forever-my-girl.jpg', titles: ['forever my girl'] },
  { src: '/movie-posters/superman.jpg', titles: ['superman'] },
  { src: '/movie-posters/kincs-ami-nincs.jpeg', titles: ['kincs ami nincs', 'kincs, ami nincs', 'kincs ami nincsen', 'kincs, ami nincsen'] },
  { src: '/movie-posters/ovizsaru.jpg', titles: ['ovizsaru', 'ovi zsaru', 'óvizsaru', 'óvi zsaru', 'kindergarten cop'] },
];

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
      ['image_url', 'Film képe'],
    ],
    emptyForm: { name: '', description: '', image_url: '' },
    fields: [
      ['name', 'Film neve', 'text'],
      ['description', 'Leírás', 'textarea'],
      ['image_url', 'Film képe URL vagy feltöltött kép', 'text'],
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
      ['movie.name', 'Film'],
      ['hall.name', 'Terem'],
      ['movie_id', 'Film ID'],
      ['hall_id', 'Terem ID'],
    ],
    emptyForm: { time: '', movie_id: '', hall_id: '' },
    fields: [
      ['time', 'Idő, pl. 1800', 'number'],
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

function isMovieImageField(key) {
  return ['image_url', 'imageUrl', 'image', 'poster_url', 'posterUrl', 'poster'].includes(key);
}

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase().trim();
}

function normalizeMovieTitle(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getMoviePosterByTitle(movie) {
  const title = normalizeMovieTitle(movie?.name || movie?.title || movie?.film || '');
  if (!title) return '';
  return moviePosterByTitle.find((poster) => poster.titles.some((name) => title.includes(normalizeMovieTitle(name))))?.src || '';
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function idsEqual(left, right) {
  return normalizeId(left) !== '' && normalizeId(left) === normalizeId(right);
}

function getMovieImageUrl(movie) {
  const explicitImage = String(
    movie?.image_url
    || movie?.imageUrl
    || movie?.image
    || movie?.poster_url
    || movie?.posterUrl
    || movie?.poster
    || movie?.logo_url
    || movie?.logoUrl
    || movie?.logo
    || ''
  ).trim();

  return explicitImage || getMoviePosterByTitle(movie);
}

function getMovieInitials(movie) {
  const name = String(movie?.name || movie?.title || 'JM').trim();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'JM';
}

function moviePayloadForBackend(payload) {
  return {
    name: payload.name,
    description: payload.description,
  };
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
  const normalized = (reservations || []).map((reservation) => ({
    ...reservation,
    seats: Array.isArray(reservation?.seats) ? reservation.seats : [],
  }));
  writeStorage(RESERVATIONS_KEY, normalized);
  window.dispatchEvent(new Event('jegymester-reservations-changed'));
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

function getDeletedScreeningOccurrences() {
  return readStorage(DELETED_SCREENING_OCCURRENCES_KEY, []);
}

function saveDeletedScreeningOccurrences(keys) {
  const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)));
  writeStorage(DELETED_SCREENING_OCCURRENCES_KEY, uniqueKeys);
  notifyLocalCatalogChanged();
}

function getScreeningTemplateId(screening) {
  return screening?.originalScreeningId ?? screening?.id;
}

function getExplicitScreeningDate(screening, meta = getScheduleMeta()) {
  return screening?.date || meta?.[screening?.id]?.date || null;
}

function getScreeningOccurrenceKey(screening, meta = getScheduleMeta()) {
  const templateId = normalizeId(getScreeningTemplateId(screening));
  const date = getExplicitScreeningDate(screening, meta) || getScreeningDate(screening, meta);
  const time = normalizeId(screening?.time);
  return templateId && date ? `${templateId}|${date}|${time}` : '';
}

function isScreeningOccurrenceDeleted(screening, meta = getScheduleMeta()) {
  const key = getScreeningOccurrenceKey(screening, meta);
  return key ? getDeletedScreeningOccurrences().includes(key) : false;
}

function rememberDeletedScreeningOccurrence(screening, meta = getScheduleMeta()) {
  const key = getScreeningOccurrenceKey(screening, meta);
  if (!key) return '';
  saveDeletedScreeningOccurrences([...getDeletedScreeningOccurrences(), key]);
  return key;
}


function getLocalMovies() {
  return readStorage(LOCAL_MOVIES_KEY, []);
}

function notifyLocalCatalogChanged() {
  window.dispatchEvent(new Event('jegymester-local-catalog-changed'));
}

function saveLocalMovies(movies) {
  writeStorage(LOCAL_MOVIES_KEY, movies);
  notifyLocalCatalogChanged();
}

function getLocalScreenings() {
  return readStorage(LOCAL_SCREENINGS_KEY, []);
}

function saveLocalScreenings(screenings) {
  writeStorage(LOCAL_SCREENINGS_KEY, screenings);
  notifyLocalCatalogChanged();
}

function mergeById(primary = [], extra = []) {
  const map = new Map();
  [...primary, ...extra].forEach((item) => {
    if (!item) return;
    const id = item.id ?? item.movie_id ?? item.hall_id;
    if (id === undefined || id === null || id === '') return;
    map.set(String(id), { ...(map.get(String(id)) || {}), ...item });
  });
  return Array.from(map.values());
}

function rememberLocalMovie(movie) {
  if (!movie) return null;
  const saved = getLocalMovies();
  const normalized = {
    ...movie,
    id: movie.id ?? movie.movie_id ?? `local-movie-${Date.now()}`,
    name: movie.name || movie.title || 'Új film',
    description: movie.description || '',
    image_url: getMovieImageUrl(movie),
    localOnly: movie.localOnly || !movie.id,
  };
  saveLocalMovies(mergeById(saved, [normalized]));
  return normalized;
}

function forgetLocalMovie(movieId) {
  if (!movieId) return;
  saveLocalMovies(getLocalMovies().filter((movie) => String(movie.id) !== String(movieId)));
  saveLocalScreenings(getLocalScreenings().filter((screening) => String(screening.movie_id) !== String(movieId)));
}

function rememberLocalScreening(screening) {
  if (!screening) return null;
  const normalized = {
    ...screening,
    id: screening.id ?? `local-screening-${Date.now()}`,
  };
  saveLocalScreenings(mergeById(getLocalScreenings(), [normalized]));
  return normalized;
}

function forgetLocalScreening(screeningId) {
  if (!screeningId) return;
  saveLocalScreenings(getLocalScreenings().filter((screening) => String(screening.id) !== String(screeningId)));
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
  const movieId = screening?.movie_id ?? screening?.movie?.id ?? screening?.movie?.movie_id;
  return screening?.movie || movies.find((movie) => idsEqual(movie.id ?? movie.movie_id, movieId)) || null;
}

function getScreeningHallId(screening) {
  return screening?.hall_id ?? screening?.hall?.id ?? screening?.hall?.hall_id;
}

function getScreeningHall(screening, halls = []) {
  const hallId = getScreeningHallId(screening);
  const embeddedHall = screening?.hall || null;
  const listedHall = halls.find((hall) => idsEqual(hall.id ?? hall.hall_id, hallId)) || null;

  // Fontos: ha a teremütközés-kezelés átírta a hall_id-t, ne a régi beágyazott hall
  // objektumot mutassuk a usernél, hanem a hall_id szerinti, ténylegesen érvényes termet.
  if (listedHall) return listedHall;
  if (embeddedHall && (hallId === undefined || hallId === null || idsEqual(embeddedHall.id ?? embeddedHall.hall_id, hallId))) {
    return embeddedHall;
  }
  return embeddedHall || null;
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
    .filter((reservation) => idsEqual(reservation.screeningId, screeningId) && reservation.status !== 'cancelled')
    .flatMap((reservation) => reservation.seats || []);
}

function getSeatReservations(screeningId, reservations = getReservations()) {
  return reservations
    .filter((reservation) => idsEqual(reservation.screeningId, screeningId) && reservation.status !== 'cancelled')
    .flatMap((reservation) => (reservation.seats || []).map((seat) => ({
      reservation,
      seat,
    })));
}

function getReservedSeatsText(screeningId, reservations = getReservations()) {
  const seats = getSeatReservations(screeningId, reservations).map(({ seat }) => seat);
  return seats.length ? seats.join(', ') : '-';
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

function getScheduleSlotBounds(dateValue, timeValue, scheduleInfo) {
  const start = getScreeningDateTimeFromParts(dateValue, timeValue);
  const blockedMinutes = Math.max(1, Number(scheduleInfo?.roomBlocked || 0));
  const end = new Date(start.getTime() + blockedMinutes * 60 * 1000);
  return { start, end };
}

function scheduleSlotsOverlap(left, right) {
  if (!left || !right) return false;
  if (Number.isNaN(left.start?.getTime()) || Number.isNaN(left.end?.getTime())) return false;
  if (Number.isNaN(right.start?.getTime()) || Number.isNaN(right.end?.getTime())) return false;
  return left.start < right.end && left.end > right.start;
}

function makeValidationError(message) {
  const error = new Error(message);
  error.isValidationError = true;
  return error;
}


const publicDemoData = {
  movies: [
    { id: 9001, name: 'Dune: Második rész', description: 'Sci-fi kalandfilm, homokféreggel és látványos csatákkal.', image_url: '/movie-posters/dune.jpg' },
    { id: 9002, name: 'Avatar', description: 'Látványos fantasy/sci-fi film családoknak és fiataloknak.', image_url: '/movie-posters/avatar.jpg' },
    { id: 9003, name: 'Batman', description: 'Akciófilm a sötét lovaggal.', image_url: '/movie-posters/batman.jpg' },
    { id: 9004, name: 'Banana Joe', description: 'Klasszikus vígjáték.', image_url: '/movie-posters/banana-joe.jpg' },
    { id: 9005, name: 'Boomerang', description: 'Romantikus vígjáték.', image_url: '/movie-posters/boomerang.jpg' },
    { id: 9006, name: 'Forever My Girl', description: 'Romantikus dráma.', image_url: '/movie-posters/forever-my-girl.jpg' },
    { id: 9007, name: 'Superman', description: 'Szuperhősfilm.', image_url: '/movie-posters/superman.jpg' },
    { id: 9008, name: 'Ovizsaru', description: 'Klasszikus családi vígjáték.', image_url: '/movie-posters/ovizsaru.jpg' },
  ],
  halls: [
    { id: 9101, name: '1. terem', capacity: 50 },
    { id: 9102, name: 'VIP terem', capacity: 30 },
  ],
  screenings: [
    { id: 9201, time: 1600, movie_id: 9001, hall_id: 9101 },
    { id: 9202, time: 1830, movie_id: 9002, hall_id: 9102 },
    { id: 9203, time: 2000, movie_id: 9003, hall_id: 9101 },
    { id: 9204, time: 1730, movie_id: 9004, hall_id: 9102 },
    { id: 9205, time: 1930, movie_id: 9005, hall_id: 9101 },
    { id: 9206, time: 2100, movie_id: 9006, hall_id: 9102 },
    { id: 9207, time: 2200, movie_id: 9007, hall_id: 9101 },
    { id: 9208, time: 1845, movie_id: 9008, hall_id: 9101 },
  ],
};

function todayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateValueAfterDays(days = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getScreeningDate(screening, meta = getScheduleMeta()) {
  return getExplicitScreeningDate(screening, meta) || todayDateValue();
}

function compareScreeningsByDateTime(left, right) {
  const leftDate = getScreeningDate(left);
  const rightDate = getScreeningDate(right);
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return Number(left?.time || 0) - Number(right?.time || 0);
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
  const baseMovies = movies.length ? movies : publicDemoData.movies;
  const baseHalls = halls.length ? halls : publicDemoData.halls;
  const baseScreenings = screenings.length ? screenings : publicDemoData.screenings;

  return {
    movies: mergeById(baseMovies, getLocalMovies()),
    halls: baseHalls,
    screenings: mergeById(baseScreenings, getLocalScreenings()),
  };
}

function createAutoScreeningsForMovies(catalog) {
  const halls = catalog.halls.length ? catalog.halls : publicDemoData.halls;
  const firstHall = halls[0] || { id: 9101, name: '1. terem', capacity: 50 };
  const usedMovieIds = new Set(catalog.screenings.map((screening) => String(screening.movie_id)));
  const baseTimes = [1400, 1600, 1800, 2000];

  const generated = catalog.movies
    .filter((movie) => movie?.id !== undefined && movie?.id !== null && !usedMovieIds.has(String(movie.id)))
    .map((movie, index) => ({
      id: AUTO_SCREENING_ID_BASE + Math.abs(Number(movie.id) || index + 1),
      movie_id: movie.id,
      hall_id: firstHall.id,
      time: baseTimes[index % baseTimes.length],
      autoCreatedForMovie: true,
    }));

  return generated.length
    ? { ...catalog, screenings: [...catalog.screenings, ...generated] }
    : catalog;
}

function syntheticScreeningId(screening, dayIndex, position) {
  const base = Number(screening?.id);
  if (Number.isFinite(base)) return base * 1000 + dayIndex * 50 + position;
  const fallback = String(screening?.id || `${screening?.movie_id || 'x'}-${position}`)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 9000000 + fallback * 100 + dayIndex * 50 + position;
}

function getScheduleInfoForScreening(screening, meta = getScheduleMeta()) {
  const ownInfo = getScheduleInfo(screening?.id, meta);
  const templateId = screening?.originalScreeningId;
  if (!templateId || meta?.[screening?.id]) return ownInfo;
  return getScheduleInfo(templateId, meta);
}

function resolveCatalogHallConflicts(catalog, screenings, scheduleMeta = getScheduleMeta()) {
  const baseHalls = catalog.halls.length ? catalog.halls : publicDemoData.halls;
  const resolvedHalls = [...baseHalls];
  const occupiedSlots = [];
  let autoHallCounter = 1;

  const getHallKey = (hall) => hall?.id ?? hall?.hall_id;
  const makeHallKey = (hallId) => normalizeId(hallId);
  const findHallById = (hallId) => resolvedHalls.find((hall) => idsEqual(getHallKey(hall), hallId));
  const createAutoHall = (preferredHall) => {
    const capacity = getHallEffectiveCapacity(preferredHall || { capacity: MAX_HALL_CAPACITY });
    let id = `auto-hall-${autoHallCounter}`;
    while (resolvedHalls.some((hall) => idsEqual(getHallKey(hall), id))) {
      autoHallCounter += 1;
      id = `auto-hall-${autoHallCounter}`;
    }
    const hall = {
      id,
      name: `${autoHallCounter}. automatikus tartalék terem`,
      capacity,
      autoCreatedForConflict: true,
    };
    autoHallCounter += 1;
    resolvedHalls.push(hall);
    return hall;
  };

  const sortedScreenings = [...(screenings || [])].sort((left, right) => {
    const byDateTime = compareScreeningsByDateTime(left, right);
    if (byDateTime !== 0) return byDateTime;
    return normalizeId(left?.id).localeCompare(normalizeId(right?.id));
  });

  const resolvedScreenings = sortedScreenings.map((screening) => {
    const preferredHallId = getScreeningHallId(screening);
    const preferredHall = findHallById(preferredHallId) || screening?.hall || null;
    if (preferredHall && !findHallById(getHallKey(preferredHall))) {
      resolvedHalls.push(preferredHall);
    }

    const candidates = [
      ...(preferredHall ? [findHallById(getHallKey(preferredHall)) || preferredHall] : []),
      ...resolvedHalls.filter((hall) => !idsEqual(getHallKey(hall), preferredHallId)),
    ].filter(Boolean);

    const date = getScreeningDate(screening, scheduleMeta);
    const bounds = getScheduleSlotBounds(date, screening.time, getScheduleInfoForScreening(screening, scheduleMeta));

    let selectedHall = candidates.find((hall) => {
      const hallId = getHallKey(hall);
      return !occupiedSlots.some((slot) => (
        slot.date === date
        && makeHallKey(slot.hallId) === makeHallKey(hallId)
        && scheduleSlotsOverlap(slot.bounds, bounds)
      ));
    });

    if (!selectedHall) {
      selectedHall = createAutoHall(preferredHall || resolvedHalls[0]);
    }

    const selectedHallId = getHallKey(selectedHall);
    occupiedSlots.push({ date, hallId: selectedHallId, bounds, screeningId: screening.id });

    const switched = preferredHallId !== undefined && preferredHallId !== null && !idsEqual(selectedHallId, preferredHallId);
    return {
      ...screening,
      hall_id: selectedHallId,
      hall: selectedHall,
      originalHallId: screening.originalHallId ?? preferredHallId,
      originalHallName: screening.originalHallName ?? preferredHall?.name ?? screening?.hall?.name ?? '',
      autoHallSwitched: Boolean(screening.autoHallSwitched || switched),
      hallConflictChecked: true,
    };
  });

  return { halls: resolvedHalls, screenings: resolvedScreenings };
}

function getCollisionFreeScreeningsForUser(catalog, screenings, scheduleMeta = getScheduleMeta()) {
  // A user oldalon ez a végső biztonsági ellenőrzés: minden megjelenítés előtt
  // dátum + terem + teljes blokkolt idő alapján újraosztjuk a termeket.
  return resolveCatalogHallConflicts(catalog, screenings, scheduleMeta).screenings;
}

function buildDailyCatalog(rawData, days = PUBLIC_DAYS_AHEAD) {
  const catalog = createAutoScreeningsForMovies(normalizeCatalogData(rawData));
  const sourceScreenings = catalog.screenings.length ? catalog.screenings : publicDemoData.screenings;
  const scheduleMeta = getScheduleMeta();

  const explicitScreenings = sourceScreenings
    .filter((screening) => getExplicitScreeningDate(screening, scheduleMeta))
    .map((screening) => ({
      ...screening,
      date: getExplicitScreeningDate(screening, scheduleMeta),
    }));

  const recurringSources = sourceScreenings
    .map((screening, index) => ({ screening, index }))
    .filter(({ screening }) => !getExplicitScreeningDate(screening, scheduleMeta));

  const recurringScreenings = Array.from({ length: Math.max(1, Number(days) || 1) }, (_, dayIndex) => {
    const date = dateValueAfterDays(dayIndex);
    return recurringSources.map(({ screening, index }) => ({
      ...screening,
      id: syntheticScreeningId(screening, dayIndex, index),
      originalScreeningId: screening.originalScreeningId ?? screening.id,
      date,
    }));
  }).flat();

  const expandedScreenings = getUpcomingScreenings([...explicitScreenings, ...recurringScreenings], scheduleMeta)
    .filter((screening) => !isScreeningOccurrenceDeleted(screening, scheduleMeta))
    .sort(compareScreeningsByDateTime);
  const resolved = resolveCatalogHallConflicts(catalog, expandedScreenings, scheduleMeta);

  return {
    ...catalog,
    halls: resolved.halls,
    screenings: resolved.screenings,
  };
}

function dateHashForScreeningId(dateValue) {
  return String(dateValue || todayDateValue())
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function uniqueScreeningTemplates(screenings = []) {
  const seen = new Set();
  return screenings.filter((screening) => {
    const templateId = screening.originalScreeningId ?? screening.id;
    const key = normalizeId(templateId);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function screeningsCoveringDate(catalog, targetDate) {
  const scheduleMeta = getScheduleMeta();
  const visibleScreenings = getUpcomingScreenings(catalog.screenings || [], scheduleMeta)
    .filter((screening) => !isScreeningOccurrenceDeleted(screening, scheduleMeta));

  let screeningsForDate = visibleScreenings;
  if (targetDate) {
    const hasTargetDate = visibleScreenings.some((screening) => getScreeningDate(screening, scheduleMeta) === targetDate);

    if (hasTargetDate) {
      screeningsForDate = visibleScreenings.filter((screening) => getScreeningDate(screening, scheduleMeta) === targetDate);
    } else {
      const templates = uniqueScreeningTemplates(visibleScreenings.length ? visibleScreenings : publicDemoData.screenings);
      const dateHash = dateHashForScreeningId(targetDate);
      screeningsForDate = templates.map((screening, index) => ({
        ...screening,
        id: syntheticScreeningId(screening, dateHash, index),
        originalScreeningId: screening.originalScreeningId ?? screening.id,
        date: targetDate,
      })).filter((screening) => !isScreeningOccurrenceDeleted(screening, scheduleMeta));
    }
  }

  return getCollisionFreeScreeningsForUser(catalog, screeningsForDate, scheduleMeta);
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

function isPastDateValue(dateValue) {
  if (!dateValue) return false;
  return String(dateValue) < todayDateValue();
}

function isScreeningInPast(screening, meta = getScheduleMeta()) {
  if (!screening) return false;
  const screeningDate = getScreeningDate(screening, meta);
  const screeningAt = getScreeningDateTimeFromParts(screeningDate, screening?.time);
  if (Number.isNaN(screeningAt.getTime())) return false;
  return screeningAt.getTime() <= Date.now();
}

function isUpcomingScreening(screening, meta = getScheduleMeta()) {
  if (!screening) return false;
  const screeningDate = getScreeningDate(screening, meta);

  // A publikus műsorban és a vendégvásárlásnál múltbeli nap nem jelenhet meg.
  // Mai dátumnál a már elkezdődött vetítést is elrejtjük.
  if (isPastDateValue(screeningDate)) return false;
  return !isScreeningInPast(screening, meta);
}

function getUpcomingScreenings(screenings = [], meta = getScheduleMeta()) {
  return (screenings || []).filter((screening) => isUpcomingScreening(screening, meta));
}

function handleFutureDateFilter(value, setFilters, filters, setError) {
  if (isPastDateValue(value)) {
    setFilters({ ...filters, date: todayDateValue() });
    if (setError) setError('Elmúlt dátumra nem lehet jegyet foglalni vagy vásárolni. A dátumot a mai napra állítottam.');
    return;
  }
  setFilters({ ...filters, date: value });
}

function getReservationScreeningDateTime(reservation) {
  return getScreeningDateTimeFromParts(reservation?.screeningDate, reservation?.time);
}

function isReservationStillValid(reservation) {
  if (!reservation || reservation.status === 'cancelled') return false;
  const screeningAt = getReservationScreeningDateTime(reservation);

  if (Number.isNaN(screeningAt.getTime())) {
    return !isPastDateValue(reservation?.screeningDate);
  }

  return screeningAt.getTime() >= Date.now();
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

function buildPaymentFormFromAuth(auth) {
  const displayUser = getDisplayUser(auth) || {};
  return {
    buyerName: displayUser.name || '',
    email: displayUser.email || '',
    phone: displayUser.phone || '',
    cardName: displayUser.name || '',
    cardNumber: '',
    expiry: '',
    cvc: '',
    acceptTerms: false,
  };
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCardNumber(value) {
  return digitsOnly(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatCardExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isValidPaymentForm(form) {
  const cardDigits = digitsOnly(form.cardNumber);
  const cvcDigits = digitsOnly(form.cvc);
  return Boolean(
    form.buyerName?.trim()
    && /^\S+@\S+\.\S+$/.test(form.email || '')
    && form.phone?.trim()
    && form.cardName?.trim()
    && cardDigits.length >= 13
    && /^\d{2}\/\d{2}$/.test(form.expiry || '')
    && cvcDigits.length >= 3
    && form.acceptTerms
  );
}


function getOrderEmailAddress(order, auth, buyerInfo = {}) {
  const displayUser = getDisplayUser(auth) || {};
  return (
    buyerInfo.email
    || order.paymentContactEmail
    || order.guestEmail
    || displayUser.email
    || auth?.user?.email
    || ''
  ).trim();
}

function buildFeedbackEmailText(order, type = 'reservation') {
  const isPayment = type === 'payment';
  const title = isPayment ? 'Bankkártyás fizetés megkezdve' : 'Foglalás létrejött';
  const codeLabel = isPayment ? 'Jegykód' : 'Foglalási kód';
  const paymentLine = isPayment
    ? `Fizetve: ${order.total} Ft\nBankkártya: ${order.cardLast4 ? `**** **** **** ${order.cardLast4}` : 'bankkártyás fizetés'}`
    : `Fizetendő a pénztárnál: ${order.total} Ft`;

  return [
    `Kedves ${order.userName || 'Vásárló'}!`,
    '',
    `A JegyMester rendszerben a következő visszaigazolás készült: ${title}.`,
    '',
    `${codeLabel}: ${order.code}`,
    `Film: ${order.movieName}`,
    `Dátum: ${order.screeningDate}`,
    `Időpont: ${timeToText(order.time)}`,
    `Terem: ${order.hallName}`,
    `Helyek: ${(order.seats || []).join(', ')}`,
    `Jegytípus: ${order.categoryLabel}`,
    paymentLine,
    `Fizetési mód: ${order.paymentMethod}`,
    '',
    isPayment
      ? 'A bankkártyás jegyvásárlás rögzítésre került.'
      : 'A foglalást a pénztárnál a foglalási kóddal lehet véglegesíteni.',
    '',
    'Köszönjük, hogy a JegyMestert választottad!'
  ].join('\n');
}

function openFeedbackEmail(order, type, auth, buyerInfo = {}) {
  const email = getOrderEmailAddress(order, auth, buyerInfo);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return false;

  const subject = type === 'payment'
    ? `JegyMester bankkártyás fizetés visszaigazolás - ${order.code}`
    : `JegyMester foglalás visszaigazolás - ${order.code}`;
  const body = buildFeedbackEmailText(order, type);
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const link = document.createElement('a');
  link.href = mailto;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
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
        error: 'A backend jelenleg tokenhez köti a filmek/vetítések listázását, ezért a bejelentkezés nélküli nézet demó műsorral és az admin által ebben a böngészőben létrehozott filmekkel működik. A vendég jegyvásárlás ettől függetlenül használható.',
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
    movieLogoUrl: getMovieImageUrl(selectedMovie),
    hallId: selectedHall.id,
    hallName: selectedHall.name,
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

function MoviePoster({ movie, size = 'card' }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getMovieImageUrl(movie);

  if (!imageUrl || failed) {
    return (
      <div className={`movie-poster movie-poster-${size} movie-poster-fallback`} aria-label={`${movie?.name || 'Film'} film képének helye`}>
        <span>{getMovieInitials(movie)}</span>
      </div>
    );
  }

  return (
    <img
      className={`movie-poster movie-poster-${size}`}
      src={imageUrl}
      alt={`${movie?.name || 'Film'} képe / plakátképe`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}


function PublicCatalog({ onGoLogin }) {
  const [data, setData] = useState(buildDailyCatalog(publicDemoData));
  const [reservations, setReservations] = useState(getReservations());
  const [hallConfigs, setHallConfigs] = useState(getHallConfigs());
  const [scheduleMeta, setScheduleMeta] = useState(getScheduleMeta());
  const [filters, setFilters] = useState({ movie: '', date: '', dayPart: '', hall: '' });
  const [selectedScreeningId, setSelectedScreeningId] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [ticketCount, setTicketCount] = useState(1);
  const [category, setCategory] = useState('adult');
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedScreening = data.screenings.find((screening) => idsEqual(screening.id, selectedScreeningId));
  const selectedHall = selectedScreening ? getScreeningHall(selectedScreening, data.halls) : null;
  const selectedMovie = selectedScreening ? getScreeningMovie(selectedScreening, data.movies) : null;
  const selectedHallConfig = selectedHall ? hallConfigs[selectedHall.id] || {} : {};
  const selectedSeatsAll = selectedHall ? generateSeats(getHallEffectiveCapacity(selectedHall, hallConfigs)) : [];
  const takenSeats = selectedScreening ? getTakenSeats(selectedScreening.id, reservations) : [];
  const total = calculateTotal(category, selectedSeats, selectedHallConfig);

  const hallNames = useMemo(() => {
    const values = data.screenings.map((screening) => getScreeningHall(screening, data.halls)?.name).filter(Boolean);
    return [...new Set(values)];
  }, [data.screenings, data.halls]);

  const scheduleDates = useMemo(() => availableScheduleDates(), []);
  const visibleScreenings = useMemo(() => screeningsCoveringDate(data, filters.date), [data, filters.date, scheduleMeta]);

  const filteredScreenings = useMemo(() => {
    const movieQuery = normalizeSearchText(filters.movie);
    return visibleScreenings.filter((screening) => {
      const movie = getScreeningMovie(screening, data.movies);
      const hall = getScreeningHall(screening, data.halls);
      const movieText = normalizeSearchText(`${movie?.name || ''} ${movie?.description || ''}`);
      const hallText = hall?.name || '';
      const dateText = getScreeningDate(screening, scheduleMeta);
      if (!isUpcomingScreening(screening, scheduleMeta)) return false;
      if (movieQuery && !movieText.includes(movieQuery)) return false;
      if (filters.date && dateText !== filters.date) return false;
      if (filters.dayPart && getDayPart(screening.time) !== filters.dayPart) return false;
      if (filters.hall && hallText !== filters.hall) return false;
      return true;
    });
  }, [visibleScreenings, data.movies, data.halls, filters, scheduleMeta]);

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
    function refreshLocalCatalog() {
      setData(buildDailyCatalog(normalizeCatalogData(publicDemoData)));
    }
    window.addEventListener('jegymester-local-catalog-changed', refreshLocalCatalog);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('jegymester-local-catalog-changed', refreshLocalCatalog);
    };
  }, []);

  useEffect(() => {
    setSelectedSeats([]);
  }, [selectedScreeningId]);

  useEffect(() => {
    if (selectedScreeningId && !filteredScreenings.some((screening) => idsEqual(screening.id, selectedScreeningId))) {
      setSelectedScreeningId(null);
      setSelectedSeats([]);
    }
  }, [selectedScreeningId, filteredScreenings]);

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
    if (isScreeningInPast(selectedScreening, scheduleMeta)) {
      setError('Elmúlt vetítésre nem lehet jegyet vásárolni. Válassz mai későbbi vagy jövőbeli időpontot.');
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
      <p className="muted">A filmek és vetítések bejelentkezés nélkül is megtekinthetők. Vendég vásárlásnál e-mail és telefon megadása kötelező. Elmúlt dátumra vagy már elkezdődött vetítésre nem lehet jegyet venni.</p>
      <Message message={error} type="info" />
      <Message message={message} type="success" />
      {loading ? <p>Publikus műsor betöltése...</p> : (
        <>
          <div className="grid-form">
            <label>Film címe vagy leírása<input type="search" value={filters.movie} onChange={(e) => setFilters({ ...filters, movie: e.target.value })} placeholder="Pl. Dune" /></label>
            <label>Dátum<input type="date" min={todayDateValue()} value={filters.date} onChange={(e) => handleFutureDateFilter(e.target.value, setFilters, filters, setError)} /></label>
            <label>Napszak<select value={filters.dayPart} onChange={(e) => setFilters({ ...filters, dayPart: e.target.value })}><option value="">Mindegy</option><option value="délelőtt">Délelőtt</option><option value="délután">Délután</option><option value="este">Este</option></select></label>
            <label>Mozihelyszín<select value={filters.hall} onChange={(e) => setFilters({ ...filters, hall: e.target.value })}><option value="">Mindegy</option>{hallNames.map((hallName) => <option key={hallName} value={hallName}>{hallName}</option>)}</select></label>
          </div>
          <div className="quick-date-row">
            <button type="button" className={!filters.date ? 'active' : ''} onClick={() => setFilters({ ...filters, date: '' })}>Mai és jövőbeli dátumok</button>
            {scheduleDates.slice(0, 10).map((dateValue) => (
              <button key={dateValue} type="button" className={filters.date === dateValue ? 'active' : ''} onClick={() => setFilters({ ...filters, date: dateValue })}>{formatDateHu(dateValue)}</button>
            ))}
          </div>
          <section className="cards-grid">
            {filteredScreenings.map((screening) => {
              const movie = getScreeningMovie(screening, data.movies);
              const hall = getScreeningHall(screening, data.halls);
              const availability = getAvailabilitySummary(screening, hall, reservations, hallConfigs);
              const pastScreening = isScreeningInPast(screening, scheduleMeta);
              return (
                <article key={screening.id} className={`screening-card movie-ticket-card ${Number(selectedScreeningId) === Number(screening.id) ? 'selected-card' : ''} ${availability.soldOut ? 'sold-out' : ''}`}>
                  <div className="movie-card-layout">
                    <MoviePoster movie={movie} />
                    <div className="movie-card-body">
                      <div className="card-title-row"><h3>{movie?.name}</h3><span className={`badge ${availability.soldOut ? 'danger-badge' : availability.almostSoldOut ? 'warning-badge' : ''}`}>{availability.soldOut ? 'Elfogyott' : `${getScreeningDate(screening, scheduleMeta)} · ${timeToText(screening.time)}`}</span></div>
                  <p className="muted">{movie?.description}</p>
                  {screening.autoCreatedForMovie && <p className="muted"><strong>Automatikus vetítés:</strong> ez a film adminban lett létrehozva, ezért a frontend foglalható műsorba tette. Pontos időpontot az Admin / Showtime ütemezésben adhatsz meg.</p>}
                  <p><strong>Terem:</strong> {hall?.name || '-'} · <strong>Szabad hely:</strong> {availability.free} / {availability.capacity}</p>
                  {screening.autoHallSwitched && <p className="muted"><strong>Terem módosítva:</strong> ütközés miatt ez a vetítés nem az eredeti {screening.originalHallName || 'teremben'}, hanem itt látható.</p>}
                  <div className="capacity-meter"><span style={{ width: `${availability.occupiedPercent}%` }} /></div>
                  <button className="primary" disabled={availability.soldOut || pastScreening} onClick={() => setSelectedScreeningId(screening.id)}>{pastScreening ? 'Elmúlt időpont' : availability.soldOut ? 'Nincs több szék' : 'Vendégként erre veszek jegyet'}</button>
                    </div>
                  </div>
                </article>
              );
            })}
            {filteredScreenings.length === 0 && <p>Nincs jövőbeli találat. Elmúlt napok nem jelennek meg, válassz mai későbbi vagy jövőbeli dátumot.</p>}
          </section>
          {selectedScreening && selectedHall && selectedMovie && (
            <section className="card nested-card">
              <div className="booking-movie-header">
                <MoviePoster movie={selectedMovie} size="detail" />
                <div>
                  <h3>Vendég vásárlás: {selectedMovie.name} · {getScreeningDate(selectedScreening, scheduleMeta)} {timeToText(selectedScreening.time)}</h3>
                  <p className="muted">Itt tényleges képként jelenik meg az adminban megadott filmkép.</p>
                  {selectedScreening.autoHallSwitched && <p className="muted"><strong>Terem módosítva:</strong> ütközés miatt az eredeti {selectedScreening.originalHallName || 'terem'} helyett most ez érvényes: {selectedHall?.name || '-'}.</p>}
                </div>
              </div>
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
                <button type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut || isScreeningInPast(selectedScreening, scheduleMeta)} onClick={autoSelectGuestSeats}>Automatikus helyválasztás</button>
                <button type="button" onClick={() => setSelectedSeats([])}>Kijelölés törlése</button>
                <button className="primary" type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut || isScreeningInPast(selectedScreening, scheduleMeta)} onClick={createGuestPurchase}>Vendég jegyvásárlás</button>
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
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', phone: '', role: 'felhasznalo' });
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
            <label>
              Szerepkör
              <select value={registerForm.role} onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}>
                <option value="felhasznalo">Felhasználó</option>
                <option value="penztaros">Pénztáros</option>
                <option value="adminisztrator">Adminisztrátor</option>
              </select>
            </label>
            <p className="muted small">A választott szerepkör határozza meg, hogy milyen jogosultságokkal lép be a felhasználó.</p>
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
                if (isMovieImageField(key)) {
                  return (
                    <td key={key}>
                      <MoviePoster movie={row} size="table" />
                      {value ? <span className="image-url-text">Film képe beállítva</span> : <span className="image-url-text muted">Nincs kép megadva</span>}
                    </td>
                  );
                }
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
  const [filters, setFilters] = useState({ movie: '', date: '', dayPart: '', hall: '' });
  const [selectedScreeningId, setSelectedScreeningId] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [ticketCount, setTicketCount] = useState(5);
  const [category, setCategory] = useState('adult');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState(() => buildPaymentFormFromAuth(auth));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedScreening = data.screenings.find((screening) => idsEqual(screening.id, selectedScreeningId));
  const selectedHall = selectedScreening ? getScreeningHall(selectedScreening, data.halls) : null;
  const selectedMovie = selectedScreening ? getScreeningMovie(selectedScreening, data.movies) : null;
  const selectedHallConfig = selectedHall ? hallConfigs[selectedHall.id] || {} : {};
  const selectedSeatsAll = selectedHall ? generateSeats(getHallEffectiveCapacity(selectedHall, hallConfigs)) : [];
  const takenSeats = selectedScreening ? getTakenSeats(selectedScreening.id, reservations) : [];
  const total = calculateTotal(category, selectedSeats, selectedHallConfig);
  const paymentFormReady = isValidPaymentForm(paymentForm);

  const myReservations = reservations.filter(
    (reservation) => idsEqual(reservation.userId, auth.user?.id) && reservation.status !== 'cancelled'
  );

  const hallNames = useMemo(() => {
    const values = data.screenings.map((screening) => getScreeningHall(screening, data.halls)?.name).filter(Boolean);
    return [...new Set(values)];
  }, [data.screenings, data.halls]);

  const scheduleDates = useMemo(() => availableScheduleDates(), []);
  const visibleScreenings = useMemo(() => screeningsCoveringDate(data, filters.date), [data, filters.date, scheduleMeta]);

  const filteredScreenings = useMemo(() => {
    const movieQuery = normalizeSearchText(filters.movie);

    return visibleScreenings.filter((screening) => {
      const movie = getScreeningMovie(screening, data.movies);
      const hall = getScreeningHall(screening, data.halls);
      const movieText = normalizeSearchText(`${movie?.name || ''} ${movie?.description || ''}`);
      const hallText = hall?.name || '';
      const dateText = getScreeningDate(screening, scheduleMeta);

      if (!isUpcomingScreening(screening, scheduleMeta)) return false;
      if (movieQuery && !movieText.includes(movieQuery)) return false;
      if (filters.date && dateText !== filters.date) return false;
      if (filters.dayPart && getDayPart(screening.time) !== filters.dayPart) return false;
      if (filters.hall && hallText !== filters.hall) return false;

      return true;
    });
  }, [visibleScreenings, data.movies, data.halls, filters, scheduleMeta]);

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
      setData(buildDailyCatalog(normalizeCatalogData(publicDemoData)));
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
      setError(`${err.message}. A frontend helyi/publikus műsorral fut tovább, ezért az adminban létrehozott helyi filmek így is megjelennek.`);
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
      if ([RESERVATIONS_KEY, HALL_CONFIG_KEY, SCHEDULE_META_KEY, DELETED_SCREENING_OCCURRENCES_KEY].includes(event.key)) {
        setReservations(getReservations());
        setHallConfigs(getHallConfigs());
        setScheduleMeta(getScheduleMeta());
      }
      if ([LOCAL_MOVIES_KEY, LOCAL_SCREENINGS_KEY, DELETED_SCREENING_OCCURRENCES_KEY].includes(event.key)) {
        loadHomeData();
      }
    }

    function onLocalCatalogChanged() {
      loadHomeData();
    }

    function refreshSeatState() {
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    }

    window.addEventListener('storage', onStorage);
    window.addEventListener('jegymester-local-catalog-changed', onLocalCatalogChanged);
    window.addEventListener('jegymester-reservations-changed', refreshSeatState);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('jegymester-local-catalog-changed', onLocalCatalogChanged);
      window.removeEventListener('jegymester-reservations-changed', refreshSeatState);
    };
  }, []);

  useEffect(() => {
    setSelectedSeats([]);
    setShowPaymentForm(false);
  }, [selectedScreeningId]);

  useEffect(() => {
    if (selectedScreeningId && !filteredScreenings.some((screening) => idsEqual(screening.id, selectedScreeningId))) {
      setSelectedScreeningId(null);
      setSelectedSeats([]);
      setShowPaymentForm(false);
    }
  }, [selectedScreeningId, filteredScreenings]);

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
    setShowPaymentForm(false);
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

  function createTicketOrder(orderType = 'reserved', buyerInfo = {}) {
    setError('');
    setMessage('');

    if (!isRegularUser(auth)) {
      setError('Jegyet csak felhasznalo szerepkörű felhasználó foglalhat vagy vásárolhat. Admin és pénztáros nem foglalhat és nem vásárolhat jegyet.');
      return false;
    }

    if (!selectedScreening || !selectedHall || !selectedMovie) {
      setError('Előbb válassz vetítést.');
      return false;
    }

    if (isScreeningInPast(selectedScreening, scheduleMeta)) {
      setError('Elmúlt vetítésre nem lehet jegyet foglalni vagy vásárolni. Válassz mai későbbi vagy jövőbeli időpontot.');
      return false;
    }

    const requested = normalizeTicketCount(ticketCount, getAvailabilitySummary(selectedScreening, selectedHall, getReservations(), getHallConfigs()).free || 1);
    const availability = getAvailabilitySummary(selectedScreening, selectedHall, getReservations(), getHallConfigs());
    if (availability.soldOut || availability.free < requested) {
      setReservations(getReservations());
      setError(`Erre a vetítésre már nincs elég szabad hely. Kért: ${requested}, szabad: ${availability.free}.`);
      return false;
    }

    if (selectedSeats.length === 0) {
      setError('Válassz legalább 1 helyet, vagy használd az automatikus helyválasztást.');
      return false;
    }

    if (selectedSeats.length !== requested) {
      setError(`Pont ${requested} helyet kell kijelölni. Most kijelölve: ${selectedSeats.length}.`);
      return false;
    }

    const freeSeatsNow = new Set(getFreeSeats(selectedScreening.id, selectedHall, getReservations(), getHallConfigs()));
    const conflictSeat = selectedSeats.find((seat) => !freeSeatsNow.has(seat));
    if (conflictSeat) {
      setReservations(getReservations());
      setError(`A(z) ${conflictSeat} hely közben foglalt vagy lezárt lett. Frissítettem a helyeket.`);
      return false;
    }

    const activeReservations = getReservations();
    const now = new Date().toISOString();
    const paid = orderType === 'paid';
    const cardDigits = digitsOnly(buyerInfo.cardNumber);
    const displayUser = getDisplayUser(auth) || {};
    const contactEmail = buyerInfo.email || displayUser.email || auth?.user?.email || '';
    const contactPhone = buyerInfo.phone || displayUser.phone || auth?.user?.phone || '';

    const newTicketOrder = {
      ...makeTicketOrder({
        auth,
        selectedScreening,
        selectedMovie,
        selectedHall,
        selectedSeats,
        category,
        status: paid ? 'paid' : 'reserved',
        paymentMethod: paid ? 'online bankkártyás fizetés' : 'pénztárban fizetendő',
        buyerName: buyerInfo.buyerName || displayUser.name,
        guestEmail: contactEmail,
        guestPhone: contactPhone,
        source: 'registered-user',
        scheduleMeta,
      }),
      paymentContactEmail: contactEmail,
      paymentContactPhone: contactPhone,
      cardHolder: paid ? buyerInfo.cardName || '' : '',
      cardLast4: paid ? cardDigits.slice(-4) : '',
      paymentStartedAt: paid ? now : null,
    };

    const next = [...activeReservations, newTicketOrder];
    saveReservations(next);
    setReservations(next);
    setSelectedSeats([]);
    setShowPaymentForm(false);

    const emailOpened = openFeedbackEmail(newTicketOrder, paid ? 'payment' : 'reservation', auth, buyerInfo);
    const emailText = emailOpened
      ? 'A visszaigazoló e-mail megnyílt az e-mail kliensben.'
      : 'Nem találtam érvényes e-mail címet, ezért a visszaigazoló e-mail nem nyílt meg.';

    if (paid) {
      setPaymentForm(buildPaymentFormFromAuth(auth));
      setMessage(`Bankkártyás fizetés megkezdve és jegyvásárlás rögzítve. Jegykód: ${newTicketOrder.code}. Fizetve: ${newTicketOrder.total} Ft. ${emailText}`);
    } else {
      setMessage(`Foglalás létrejött. Foglalási kód: ${newTicketOrder.code}. Fizetendő a pénztárnál: ${newTicketOrder.total} Ft. ${emailText}`);
    }

    return true;
  }

  function createReservation() {
    createTicketOrder('reserved');
  }
  function openPaymentForm() {
    setError('');
    setMessage('');

    if (!isRegularUser(auth)) {
      setError('Jegyet csak felhasznalo szerepkörű felhasználó vásárolhat.');
      return;
    }

    if (!selectedScreening || !selectedHall || !selectedMovie) {
      setError('Előbb válassz vetítést.');
      return;
    }

    if (isScreeningInPast(selectedScreening, scheduleMeta)) {
      setError('Elmúlt vetítésre nem lehet jegyet vásárolni. Válassz mai későbbi vagy jövőbeli időpontot.');
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

    const displayUser = getDisplayUser(auth) || {};
    setPaymentForm((current) => ({
      ...current,
      buyerName: current.buyerName || displayUser.name || '',
      email: current.email || displayUser.email || '',
      phone: current.phone || displayUser.phone || '',
      cardName: current.cardName || current.buyerName || displayUser.name || '',
    }));
    setShowPaymentForm(true);
    setMessage('Töltsd ki a vásárlói és bankkártya adatokat, majd kattints a Bankkártya fizetés megkezdése gombra.');
  }

  function startCardPayment(event) {
    event.preventDefault();
    if (!paymentFormReady) {
      setError('A bankkártyás fizetéshez töltsd ki az összes kötelező mezőt, adj meg érvényes e-mail címet, kártyaszámot, lejáratot és CVC kódot, majd fogadd el a fizetési feltételeket.');
      return;
    }
    createTicketOrder('paid', paymentForm);
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
          <p>A műsorrend film, dátum, napszak és mozihelyszín szerint szűrhető. A foglalási állapot 5 másodpercenként frissül, minden jövőbeli időpontra működik, és a rendszer nem enged több jegyet, mint ahány szabad szék van az adott teremben. Elmúlt dátumra vagy már elkezdődött vetítésre nem lehet foglalni.</p>
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
                <input type="date" min={todayDateValue()} value={filters.date} onChange={(e) => handleFutureDateFilter(e.target.value, setFilters, filters, setError)} />
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
                <select value={filters.hall} onChange={(e) => setFilters({ ...filters, hall: e.target.value })}>
                  <option value="">Mindegy</option>
                  {hallNames.map((hallName) => <option key={hallName} value={hallName}>{hallName}</option>)}
                </select>
              </label>
            </div>
            <div className="quick-date-row">
              <button type="button" className={!filters.date ? 'active' : ''} onClick={() => setFilters({ ...filters, date: '' })}>Mai és jövőbeli dátumok</button>
              {scheduleDates.slice(0, 10).map((dateValue) => (
                <button key={dateValue} type="button" className={filters.date === dateValue ? 'active' : ''} onClick={() => setFilters({ ...filters, date: dateValue })}>{formatDateHu(dateValue)}</button>
              ))}
            </div>
          </section>

          <section className="cards-grid">
            {filteredScreenings.length === 0 ? <p>Nincs jövőbeli találat. Válassz mai későbbi vagy jövőbeli dátumot, vagy töröld a dátumszűrést.</p> : filteredScreenings.map((screening) => {
              const movie = getScreeningMovie(screening, data.movies);
              const hall = getScreeningHall(screening, data.halls);
              const availability = getAvailabilitySummary(screening, hall, reservations, hallConfigs);
              const info = getScheduleInfo(screening.id, scheduleMeta);
              const pastScreening = isScreeningInPast(screening, scheduleMeta);

              return (
                <article key={screening.id} className={`screening-card movie-ticket-card ${Number(selectedScreeningId) === Number(screening.id) ? 'selected-card' : ''} ${availability.soldOut ? 'sold-out' : ''}`}>
                  <div className="movie-card-layout">
                    <MoviePoster movie={movie} />
                    <div className="movie-card-body">
                      <div className="card-title-row">
                        <h3>{movie?.name || `Film #${screening.movie_id}`}</h3>
                        <span className={`badge ${availability.soldOut ? 'danger-badge' : availability.almostSoldOut ? 'warning-badge' : ''}`}>{availability.soldOut ? 'Elfogyott' : `${getScreeningDate(screening, scheduleMeta)} · ${timeToText(screening.time)} · ${getDayPart(screening.time)}`}</span>
                      </div>
                  <p className="muted">{movie?.description || 'Nincs leírás.'}</p>
                  <p><strong>Hely:</strong> {hall?.name || '-'} · <strong>Terem:</strong> {hall?.name || '-'}</p>
                  {screening.autoHallSwitched && <p className="muted"><strong>Terem módosítva:</strong> ütközés miatt ez a vetítés nem az eredeti {screening.originalHallName || 'teremben'}, hanem itt látható.</p>}
                  <p><strong>Szabad hely:</strong> {availability.free} / {availability.capacity} · <strong>Foglalt:</strong> {availability.taken} · <strong>Lezárt:</strong> {availability.closed}</p>
                  <div className="capacity-meter"><span style={{ width: `${availability.occupiedPercent}%` }} /></div>
                  <p><strong>Teljes filmidő reklámokkal:</strong> {info.total} perc · <strong>Terem foglalva takarítással:</strong> {info.roomBlocked} perc</p>
                  <button className="primary" disabled={availability.soldOut || pastScreening} onClick={() => selectScreening(screening)}>{pastScreening ? 'Elmúlt időpont' : availability.soldOut ? 'Nincs több szék' : 'Erre foglalok / vásárolok'}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {selectedScreening && selectedHall && (
            <section className="card">
              <div className="booking-movie-header">
                <MoviePoster movie={selectedMovie} size="detail" />
                <div className="booking-movie-title">
                  <div className="card-title-row">
                    <h3>Jegyfoglalás / jegyvásárlás: {selectedMovie?.name} · {getScreeningDate(selectedScreening, scheduleMeta)} {timeToText(selectedScreening.time)}</h3>
                    <span className="badge">Max. teremkapacitás: {MAX_HALL_CAPACITY}</span>
                  </div>
                  <p className="muted">Itt tényleges képként jelenik meg az adminban megadott filmkép.</p>
                  {selectedScreening.autoHallSwitched && <p className="muted"><strong>Terem módosítva:</strong> ütközés miatt az eredeti {selectedScreening.originalHallName || 'terem'} helyett most ez érvényes: {selectedHall?.name || '-'}.</p>}
                </div>
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
                <button type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut || isScreeningInPast(selectedScreening, scheduleMeta)} onClick={() => autoSelectSeats()}>Automatikus helyválasztás {ticketCount} jegyre</button>
                <button type="button" onClick={() => setSelectedSeats([])}>Kijelölés törlése</button>
                <button type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut || isScreeningInPast(selectedScreening, scheduleMeta)} onClick={createReservation}>Foglalás létrehozása</button>
                <button className="primary" type="button" disabled={getAvailabilitySummary(selectedScreening, selectedHall, reservations, hallConfigs).soldOut || isScreeningInPast(selectedScreening, scheduleMeta)} onClick={openPaymentForm}>Azonnali jegyvásárlás</button>
              </div>

              {showPaymentForm && (
                <form className="payment-form nested-card" onSubmit={startCardPayment}>
                  <div className="card-title-row">
                    <h3>Bankkártyás fizetési űrlap</h3>
                    <span className="badge">Fizetendő: {total} Ft</span>
                  </div>
                  <p className="muted small">Az azonnali vásárlás csak akkor indítható, ha minden kötelező mezőt kitöltöttél. A gomb megnyitja a vásárló e-mail címére előkészített visszaigazoló e-mailt is. A kártyaadatokból a frontend csak az utolsó 4 számjegyet menti el a helyi jegyadatokhoz.</p>
                  <div className="grid-form">
                    <label>
                      Vásárló neve
                      <input required value={paymentForm.buyerName} onChange={(e) => setPaymentForm({ ...paymentForm, buyerName: e.target.value })} placeholder="Pl. Kovács Anna" />
                    </label>
                    <label>
                      E-mail cím
                      <input type="email" required value={paymentForm.email} onChange={(e) => setPaymentForm({ ...paymentForm, email: e.target.value })} placeholder="pelda@email.hu" />
                    </label>
                    <label>
                      Telefonszám
                      <input required value={paymentForm.phone} onChange={(e) => setPaymentForm({ ...paymentForm, phone: e.target.value })} placeholder="+36 30 123 4567" />
                    </label>
                    <label>
                      Kártyán szereplő név
                      <input required value={paymentForm.cardName} onChange={(e) => setPaymentForm({ ...paymentForm, cardName: e.target.value })} placeholder="Pl. KOVACS ANNA" />
                    </label>
                    <label>
                      Bankkártyaszám
                      <input inputMode="numeric" autoComplete="cc-number" required value={paymentForm.cardNumber} onChange={(e) => setPaymentForm({ ...paymentForm, cardNumber: formatCardNumber(e.target.value) })} placeholder="1234 5678 9012 3456" />
                    </label>
                    <label>
                      Lejárat
                      <input inputMode="numeric" autoComplete="cc-exp" required value={paymentForm.expiry} onChange={(e) => setPaymentForm({ ...paymentForm, expiry: formatCardExpiry(e.target.value) })} placeholder="HH/ÉÉ" />
                    </label>
                    <label>
                      CVC
                      <input inputMode="numeric" autoComplete="cc-csc" required value={paymentForm.cvc} onChange={(e) => setPaymentForm({ ...paymentForm, cvc: digitsOnly(e.target.value).slice(0, 4) })} placeholder="123" />
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={paymentForm.acceptTerms} onChange={(e) => setPaymentForm({ ...paymentForm, acceptTerms: e.target.checked })} />
                      Elfogadom a bankkártyás fizetési feltételeket.
                    </label>
                  </div>
                  <div className="form-actions">
                    <button className="primary" type="submit" disabled={!paymentFormReady}>Bankkártya fizetés megkezdése</button>
                    <button type="button" onClick={() => setShowPaymentForm(false)}>Mégsem</button>
                  </div>
                </form>
              )}

              <p className="muted small">
                Példa: ha 5 felnőtt jegyet választasz, az alapár {5 * ticketCategories.adult.price} Ft. VIP helyenként +600 Ft. A foglalás pénztárban fizetendő, a vásárlás azonnal fizetett állapotba kerül. Foglalás és bankkártyás fizetés után a frontend visszaigazoló e-mailt készít elő a felhasználó e-mail címére.
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

  const selectedReservation = reservations.find((reservation) => reservation.code === selectedCode && isReservationStillValid(reservation));
  const selectedScreening = selectedReservation
    ? data.screenings.find((screening) => idsEqual(screening.id, selectedReservation.screeningId)) || {
      id: selectedReservation.screeningId,
      time: selectedReservation.time,
      date: selectedReservation.screeningDate,
      hall_id: selectedReservation.hallId,
      movie_id: selectedReservation.movieId,
    }
    : null;
  const selectedHall = selectedReservation
    ? getScreeningHall(selectedScreening, data.halls)
      || data.halls.find((hall) => idsEqual(hall.id ?? hall.hall_id, selectedReservation.hallId))
      || { id: selectedReservation.hallId || 'cashier-hall', name: selectedReservation.hallName || 'Terem', capacity: MAX_HALL_CAPACITY }
    : null;
  const selectedHallConfig = selectedHall ? hallConfigs[selectedHall.id] || {} : {};
  const seatCount = selectedReservation?.seats?.length || 0;
  const seatsAll = selectedHall ? generateSeats(getHallEffectiveCapacity(selectedHall, hallConfigs)) : [];
  const takenSeats = selectedScreening
    ? getTakenSeats(selectedScreening.id, reservations).filter((seat) => !selectedReservation?.seats?.includes(seat))
    : [];

  const cashierSelectedScreening = data.screenings.find((screening) => idsEqual(screening.id, cashierSale.screeningId));
  const cashierSelectedHall = cashierSelectedScreening ? getScreeningHall(cashierSelectedScreening, data.halls) : null;
  const cashierSelectedMovie = cashierSelectedScreening ? getScreeningMovie(cashierSelectedScreening, data.movies) : null;
  const cashierHallConfig = cashierSelectedHall ? hallConfigs[cashierSelectedHall.id] || {} : {};
  const cashierSeatsAll = cashierSelectedHall ? generateSeats(getHallEffectiveCapacity(cashierSelectedHall, hallConfigs)) : [];
  const cashierTakenSeats = cashierSelectedScreening ? getTakenSeats(cashierSelectedScreening.id, reservations) : [];
  const cashierTotal = calculateTotal(cashierSale.category, cashierSaleSeats, cashierHallConfig);
  const activeCashierOrders = reservations
    .filter(isReservationStillValid)
    .sort((left, right) => getReservationScreeningDateTime(left).getTime() - getReservationScreeningDateTime(right).getTime())
    .map((reservation) => ({
      id: reservation.id,
      code: reservation.code,
      movie: reservation.movieName || '-',
      date: reservation.screeningDate || '-',
      time: timeToText(reservation.time),
      hall: reservation.hallName || '-',
      seats: (reservation.seats || []).join(', ') || '-',
      status: getOrderStatusLabel(reservation),
      buyer: reservation.userName || reservation.guestEmail || '-',
      source: reservation.source === 'registered-user' ? 'user felület' : reservation.source === 'cashier-sale' ? 'pénztár' : reservation.source || '-',
    }));

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    }, 3000);

    function refreshCashierSeatState() {
      setReservations(getReservations());
      setHallConfigs(getHallConfigs());
      setScheduleMeta(getScheduleMeta());
    }

    function onStorage(event) {
      if ([RESERVATIONS_KEY, HALL_CONFIG_KEY, SCHEDULE_META_KEY, LOCAL_MOVIES_KEY, LOCAL_SCREENINGS_KEY, DELETED_SCREENING_OCCURRENCES_KEY].includes(event.key)) {
        refreshCashierSeatState();
      }
    }

    window.addEventListener('storage', onStorage);
    window.addEventListener('jegymester-reservations-changed', refreshCashierSeatState);
    window.addEventListener('jegymester-local-catalog-changed', loadCashierData);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('jegymester-reservations-changed', refreshCashierSeatState);
      window.removeEventListener('jegymester-local-catalog-changed', loadCashierData);
    };
  }, []);

  function selectReservationForSeatChange(reservationOrCode) {
    const normalized = typeof reservationOrCode === 'string'
      ? reservationOrCode.trim().toUpperCase()
      : String(reservationOrCode?.code || '').trim().toUpperCase();
    const latestReservations = getReservations();
    const found = latestReservations.find((reservation) => reservation.code === normalized && isReservationStillValid(reservation));
    setReservations(latestReservations);
    setCode(normalized);
    setSelectedCode(found?.code || '');
    setNewSeats([...(found?.seats || [])]);
    setMessage(found ? 'Foglalás kiválasztva. A helycserénél kattints az új szabad székre, a rendszer lecseréli a régi helyet.' : '');
    setError(found ? '' : 'Nincs ilyen aktív és még érvényes foglalási kód. Elmúlt vetítést már nem lehet helycserére kiválasztani.');
  }

  function findReservation(event) {
    event.preventDefault();
    selectReservationForSeatChange(code);
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
    setError('');
    setNewSeats((current) => {
      if (current.includes(seat)) return current.filter((item) => item !== seat);
      if (current.length < seatCount) return [...current, seat];

      const originalSeats = selectedReservation?.seats || [];
      const replaceIndex = current.findIndex((item) => originalSeats.includes(item));
      const safeIndex = replaceIndex >= 0 ? replaceIndex : 0;
      return current.map((item, index) => index === safeIndex ? seat : item);
    });
  }

  function changeSeats() {
    if (!selectedReservation) return;
    if (!selectedScreening || !selectedHall) {
      setError('Nem található a foglaláshoz tartozó vetítés vagy terem, ezért a helycsere nem menthető. Frissítsd a pénztáros oldalt.');
      return;
    }
    if (newSeats.length !== seatCount) {
      setError(`Pont ${seatCount} új helyet kell kijelölni.`);
      return;
    }
    const uniqueNewSeats = [...new Set(newSeats)];
    if (uniqueNewSeats.length !== seatCount) {
      setError('Ugyanazt a széket nem lehet kétszer kijelölni.');
      return;
    }
    const hallConfig = getHallConfigs()[selectedHall.id] || {};
    const latestReservations = getReservations();
    const blockedByOther = new Set(getTakenSeats(selectedScreening.id, latestReservations).filter((seat) => !selectedReservation.seats?.includes(seat)));
    const closedSeats = new Set(hallConfig.closedSeats || []);
    const conflictSeat = uniqueNewSeats.find((seat) => blockedByOther.has(seat) || closedSeats.has(seat));
    if (conflictSeat) {
      setReservations(latestReservations);
      setError(`A(z) ${conflictSeat} hely már foglalt vagy le van zárva.`);
      return;
    }
    updateReservation(selectedReservation.code, (reservation) => ({
      ...reservation,
      seats: uniqueNewSeats,
      total: calculateTotal(reservation.category, uniqueNewSeats, hallConfig),
      changedAt: new Date().toISOString(),
    }));
    setNewSeats(uniqueNewSeats);
    setMessage(`Helycsere megtörtént. Új helyek: ${uniqueNewSeats.join(', ')}.`);
    setError('');
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
        <h3>User felületről érkező aktív foglalások és jegyek</h3>
        <p className="muted">Itt csak a mai és jövőbeli, még érvényes foglalások/jegyek látszanak. Az elmúlt dátumú vagy már elkezdődött vetítések nem jelennek meg.</p>
        <DataTable
          columns={[
            ['code', 'Kód'],
            ['movie', 'Film'],
            ['date', 'Dátum'],
            ['time', 'Idő'],
            ['hall', 'Terem'],
            ['seats', 'Foglalt/megvett székek'],
            ['status', 'Állapot'],
            ['buyer', 'Vevő'],
            ['source', 'Forrás'],
          ]}
          rows={activeCashierOrders}
          actions={(row) => <button type="button" onClick={() => selectReservationForSeatChange(row.code)}>Helycsere</button>}
        />
      </section>

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
                return <option key={screening.id} value={screening.id}>{movie?.name || screening.movie_id} · {getScreeningDate(screening, scheduleMeta)} {timeToText(screening.time)} · {hall?.name || '-'}</option>;
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
            <h4>{selectedReservation.movieName} · {selectedReservation.screeningDate} {timeToText(selectedReservation.time)}</h4>
            <p><strong>Vendég:</strong> {selectedReservation.userName} · <strong>Kód:</strong> {selectedReservation.code} · <strong>Terem:</strong> {selectedReservation.hallName}</p>
            <p><strong>User által foglalt/megvett helyek:</strong> {(selectedReservation.seats || []).join(', ')} · <strong>Összeg:</strong> {selectedReservation.total} Ft · <strong>Állapot:</strong> {selectedReservation.status === 'paid' ? 'fizetve' : 'lefoglalva'}</p>
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
          <p className="muted">A kékkel kijelölt helyek a user által jelenleg foglalt/megvett székek. Kattints egy új szabad székre: ha már ki van jelölve a szükséges darabszám, a rendszer automatikusan lecseréli az egyik régi helyet. Mentéshez pontosan {seatCount} hely legyen kijelölve.</p>
          <p><strong>Jelenlegi új kijelölés:</strong> {newSeats.length ? newSeats.join(', ') : '-'}</p>
          <SeatGrid
            seats={seatsAll}
            selectedSeats={newSeats}
            takenSeats={takenSeats}
            vipSeats={selectedHallConfig.vipSeats || []}
            closedSeats={selectedHallConfig.closedSeats || []}
            onToggleSeat={toggleNewSeat}
          />
          <div className="form-actions">
            <button className="primary" type="button" onClick={changeSeats}>Helycsere mentése</button>
            <button type="button" onClick={() => setNewSeats([...(selectedReservation?.seats || [])])}>Eredeti helyek visszaállítása</button>
            <button type="button" onClick={() => setNewSeats([])}>Kijelölés törlése</button>
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
            ['occupied', 'Foglalt db'],
            ['reservedSeats', 'Foglalt székek'],
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
              hall: hall?.name || '-',
              free: availability.soldOut ? 'Elfogyott' : `${availability.free} / ${availability.capacity}`,
              occupied: availability.taken,
              reservedSeats: getReservedSeatsText(screening.id, reservations),
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

  function findAdminScreeningOverlaps(payload) {
    const scheduleMeta = getScheduleMeta();
    const targetDate = getScreeningDate(payload, scheduleMeta);
    const targetInfo = getScheduleInfo(editingId || 'admin-screening-new', scheduleMeta);
    const target = getScheduleSlotBounds(targetDate, payload.time, targetInfo);
    const allScreenings = mergeById(publicDemoData.screenings, mergeById(rows, getLocalScreenings()));

    return allScreenings.filter((screening) => {
      if (editingId && idsEqual(screening.id, editingId)) return false;
      if (!idsEqual(screening.hall_id, payload.hall_id)) return false;
      const screeningDate = getScreeningDate(screening, scheduleMeta);
      if (screeningDate !== targetDate) return false;
      const existingInfo = getScheduleInfo(screening.id, scheduleMeta);
      const existing = getScheduleSlotBounds(screeningDate, screening.time, existingInfo);
      return scheduleSlotsOverlap(target, existing);
    });
  }

  async function loadRows() {
    if (!config) {
      setRows([]);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await apiRequest(config.endpoint, {}, token);
      const serverRows = Array.isArray(data) ? data : [];
      if (active === 'movies') {
        setRows(mergeById(serverRows, getLocalMovies()));
      } else if (active === 'screenings') {
        setRows(mergeById(serverRows, getLocalScreenings()));
      } else {
        setRows(serverRows);
      }
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

  function handleMovieImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('Csak képfájl választható ki a film képéhez.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, image_url: String(reader.result || '') }));
      setMessage('A film képe betöltve. Mentés után a felhasználói foglalásnál is ez a kép jelenik meg.');
    };
    reader.onerror = () => setError('Nem sikerült beolvasni a képet.');
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const payload = normalizePayload(form);

      if (active === 'halls' && Number(payload.capacity) > MAX_HALL_CAPACITY) {
        throw makeValidationError(`Egy teremben maximum ${MAX_HALL_CAPACITY} hely lehet, ezért nem adhatsz meg ennél nagyobb férőhelyet.`);
      }

      if (active === 'screenings') {
        if (!payload.movie_id || !payload.hall_id || payload.time === null || payload.time === undefined) {
          throw makeValidationError('Vetítés létrehozásához kötelező a film ID, terem ID és kezdési idő.');
        }
        const overlaps = findAdminScreeningOverlaps(payload);
        if (overlaps.length) {
          throw makeValidationError('Ezt a vetítést nem lehet felvenni: ugyanabban a teremben a teljes filmidő + reklám + előzetes + takarítás alapján ütközne egy másik vetítéssel. Válassz másik időpontot vagy másik termet.');
        }
      }

      const method = editingId ? 'PUT' : 'POST';
      const path = editingId ? `${config.endpoint}${editingId}` : config.endpoint;
      const backendPayload = active === 'movies' ? moviePayloadForBackend(payload) : payload;
      const savedItem = await apiRequest(path, { method, body: JSON.stringify(backendPayload) }, token);
      const savedObject = savedItem && typeof savedItem === 'object' ? savedItem : {};
      const localCopy = { ...savedObject, ...payload, id: savedObject.id ?? savedObject.movie_id ?? savedObject.screening_id ?? editingId ?? payload.id };

      if (active === 'movies') {
        rememberLocalMovie(localCopy);
      }

      if (active === 'screenings') {
        rememberLocalScreening(localCopy);
      }

      setMessage(active === 'movies'
        ? (editingId ? 'Film módosítva. A felhasználói foglalás/vásárlás listában is frissül.' : 'Film létrehozva. A felhasználói oldalon is megjelenik, automatikus vetítéssel vagy a Showtime ütemezésben létrehozott vetítéssel.')
        : editingId ? 'Sikeres módosítás.' : 'Sikeres létrehozás.');
      setForm(config.emptyForm || {});
      setEditingId(null);
      await loadRows();
    } catch (err) {
      if (err.isValidationError) {
        setError(err.message);
        return;
      }

      const payload = normalizePayload(form);
      if (active === 'movies') {
        const localMovie = rememberLocalMovie({ ...payload, id: editingId || `local-movie-${Date.now()}`, localOnly: true });
        setRows((current) => mergeById(current, [localMovie]));
        setForm(config.emptyForm || {});
        setEditingId(null);
        setMessage(editingId
          ? 'A backend nem mentette el a film módosítását, ezért a frontend helyben frissítette. A film képe a felhasználói foglalásnál is látszik.'
          : 'A backend nem mentette el a filmet, ezért a frontend helyi filmként létrehozta. A felhasználói műsorban így is megjelenik és foglalható/vásárolható.');
        return;
      }
      if (!editingId && active === 'screenings') {
        const localScreening = rememberLocalScreening({ ...payload, id: `local-screening-${Date.now()}`, localOnly: true });
        setRows((current) => mergeById(current, [localScreening]));
        setForm(config.emptyForm || {});
        setMessage('A backend nem mentette el a vetítést, ezért a frontend helyi vetítésként létrehozta. A felhasználói műsorban így is megjelenik.');
        return;
      }
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
      if (active === 'movies') forgetLocalMovie(id);
      if (active === 'screenings') forgetLocalScreening(id);
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
                {active === 'movies' && (
                  <div className="movie-image-admin-box">
                    <div>
                      <strong>Film képe a foglalásnál</strong>
                      <p className="muted small">Ide valódi filmképet/plakátképet adj meg URL-lel, vagy válassz képfájlt. Mentés után ugyanez a kép látszik a felhasználói foglalási és vásárlási kártyákon.</p>
                      <label>
                        Kép kiválasztása fájlból
                        <input type="file" accept="image/*" onChange={handleMovieImageFile} />
                      </label>
                    </div>
                    <MoviePoster movie={form} size="detail" />
                  </div>
                )}
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
  const [form, setForm] = useState({ ...defaultScheduleMeta, date: todayDateValue() });
  const [newForm, setNewForm] = useState({
    movie_id: '',
    hall_id: '',
    date: todayDateValue(),
    time: '1800',
    movieRuntime: defaultScheduleMeta.movieRuntime,
    ads: defaultScheduleMeta.ads,
    trailers: defaultScheduleMeta.trailers,
    cleaning: defaultScheduleMeta.cleaning,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deletedKeys, setDeletedKeys] = useState(getDeletedScreeningOccurrences());
  const [scheduleFilterDate, setScheduleFilterDate] = useState('');

  async function loadData() {
    try {
      const [movies, halls, screenings] = await Promise.all([
        apiRequest('/movie/', {}, auth.token),
        apiRequest('/hall/', {}, auth.token),
        apiRequest('/screening/', {}, auth.token),
      ]);
      setData(normalizeCatalogData({ movies, halls, screenings }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, [auth.token]);

  useEffect(() => {
    if (!selectedId) return;
    setForm({ ...defaultScheduleMeta, date: todayDateValue(), ...(meta[selectedId] || {}) });
  }, [selectedId, meta]);

  const scheduleCatalog = useMemo(() => buildDailyCatalog(data), [data, meta, deletedKeys]);
  const scheduleScreenings = scheduleCatalog.screenings;

  function normalizeTimeValue(value) {
    const digits = String(value || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
    const hour = Math.min(23, Number(digits.slice(0, 2)) || 0);
    const minute = Math.min(59, Number(digits.slice(2, 4)) || 0);
    return hour * 100 + minute;
  }

  function getScheduleEnd(dateValue, timeValue, scheduleInfo) {
    return getScheduleSlotBounds(dateValue, timeValue, scheduleInfo);
  }

  function findHallOverlaps({ hallId, date, time, scheduleInfo, ignoreId }) {
    const target = getScheduleEnd(date, time, scheduleInfo);
    if (Number.isNaN(target.start.getTime()) || Number.isNaN(target.end.getTime())) return [];

    return scheduleScreenings.filter((screening) => {
      if (ignoreId && idsEqual(screening.id, ignoreId)) return false;
      if (!idsEqual(screening.hall_id, hallId)) return false;

      const screeningDate = getScreeningDate(screening, meta);
      if (screeningDate !== date) return false;

      const existingInfo = getScheduleInfo(screening.id, meta);
      const existing = getScheduleEnd(screeningDate, screening.time, existingInfo);
      return scheduleSlotsOverlap(target, existing);
    });
  }

  function findAvailableHallForSlot({ preferredHallId, date, time, scheduleInfo, ignoreId }) {
    const preferredHall = data.halls.find((item) => idsEqual(item.id ?? item.hall_id, preferredHallId));
    const hallCandidates = [
      ...(preferredHall ? [preferredHall] : []),
      ...data.halls.filter((item) => !idsEqual(item.id ?? item.hall_id, preferredHallId)),
    ];

    for (const candidate of hallCandidates) {
      const candidateId = candidate.id ?? candidate.hall_id;
      const overlaps = findHallOverlaps({ hallId: candidateId, date, time, scheduleInfo, ignoreId });
      if (!overlaps.length) {
        return {
          hallId: candidateId,
          hall: candidate,
          switched: preferredHall ? !idsEqual(candidateId, preferredHallId) : false,
          overlaps: [],
        };
      }
    }

    return {
      hallId: null,
      hall: null,
      switched: false,
      overlaps: findHallOverlaps({ hallId: preferredHallId, date, time, scheduleInfo, ignoreId }),
    };
  }

  function schedulePayloadFromForm(values) {
    return {
      movieRuntime: Number(values.movieRuntime || 0),
      ads: Number(values.ads || 0),
      trailers: Number(values.trailers || 0),
      cleaning: Number(values.cleaning || 0),
    };
  }

  async function createShowtime(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const movieId = Number(newForm.movie_id);
    let hallId = Number(newForm.hall_id);
    const movie = data.movies.find((item) => idsEqual(item.id ?? item.movie_id, movieId));
    let hall = data.halls.find((item) => idsEqual(item.id ?? item.hall_id, hallId));
    const time = normalizeTimeValue(newForm.time);
    const scheduleInfo = getScheduleInfo('new', { new: schedulePayloadFromForm(newForm) });
    let autoHallMessage = '';

    if (!movieId || !movie) {
      setError('Válassz filmet. Az Admin / Filmek fülön létrehozott filmek itt automatikusan megjelennek.');
      return;
    }
    if (!hallId || !hall) {
      setError('Válassz termet.');
      return;
    }
    if (!newForm.date) {
      setError('Adj meg vetítési dátumot.');
      return;
    }
    if (isPastDateValue(newForm.date)) {
      setError('Elmúlt dátumra nem lehet új showtime-ot létrehozni. Válassz mai vagy jövőbeli dátumot.');
      return;
    }

    const hallChoice = findAvailableHallForSlot({
      preferredHallId: hallId,
      date: newForm.date,
      time,
      scheduleInfo,
    });

    if (!hallChoice.hallId) {
      setError('A teljes filmidő + reklám + előzetes + takarítás alapján nincs szabad terem erre az időszakra. Így az adminban nem lehet felvenni ezt a showtime-ot.');
      return;
    }

    if (hallChoice.switched) {
      autoHallMessage = ` A kiválasztott terem ütközött, ezért a vetítést automatikusan áttettem ide: ${hallChoice.hall?.name || 'másik terem'}.`;
    }

    hallId = Number(hallChoice.hallId);
    hall = hallChoice.hall || hall;

    try {
      const created = await apiRequest('/screening/', {
        method: 'POST',
        body: JSON.stringify({
          movie_id: movieId,
          hall_id: hallId,
          time,
        }),
      }, auth.token);

      const createdWithFallback = rememberLocalScreening(created || {
        id: `local-showtime-${Date.now()}`,
        movie_id: movieId,
        hall_id: hallId,
        time,
      });

      const createdId = createdWithFallback?.id || created?.id;
      if (createdId) {
        const nextMeta = {
          ...meta,
          [createdId]: {
            date: newForm.date,
            ...schedulePayloadFromForm(newForm),
          },
        };
        saveScheduleMeta(nextMeta);
        setMeta(nextMeta);
      }

      setMessage(`Új showtime létrehozva: ${movie.name} · ${newForm.date} · ${timeToText(time)} · ${hall?.name || 'terem'}.${autoHallMessage}`);
      setNewForm({
        movie_id: '',
        hall_id: '',
        date: todayDateValue(),
        time: '1800',
        movieRuntime: defaultScheduleMeta.movieRuntime,
        ads: defaultScheduleMeta.ads,
        trailers: defaultScheduleMeta.trailers,
        cleaning: defaultScheduleMeta.cleaning,
      });
      await loadData();
    } catch (err) {
      const fallbackScreening = rememberLocalScreening({
        id: `local-showtime-${Date.now()}`,
        movie_id: movieId,
        hall_id: hallId,
        time,
        localOnly: true,
      });
      const fallbackId = fallbackScreening?.id;
      if (fallbackId) {
        const nextMeta = {
          ...meta,
          [fallbackId]: {
            date: newForm.date,
            ...schedulePayloadFromForm(newForm),
          },
        };
        saveScheduleMeta(nextMeta);
        setMeta(nextMeta);
        setMessage(`A backend nem mentette el a showtime-ot, ezért a frontend helyi vetítésként létrehozta: ${movie?.name || 'Film'} · ${newForm.date} · ${timeToText(time)} · ${hall?.name || 'terem'}.${autoHallMessage}`);
        await loadData();
        return;
      }
      setError(err.message);
    }
  }

  function saveMeta(event) {
    event.preventDefault();
    if (!selectedId) {
      setError('Válassz vetítést.');
      return;
    }

    if (isPastDateValue(form.date || todayDateValue())) {
      setError('Elmúlt dátumra nem lehet vetítést ütemezni. Válassz mai vagy jövőbeli dátumot.');
      return;
    }

    const selectedScreening = scheduleScreenings.find((screening) => idsEqual(screening.id, selectedId));
    const scheduleInfo = getScheduleInfo(selectedId, { [selectedId]: schedulePayloadFromForm(form) });
    const overlaps = selectedScreening ? findHallOverlaps({
      hallId: selectedScreening.hall_id,
      date: form.date || todayDateValue(),
      time: selectedScreening.time,
      scheduleInfo,
      ignoreId: selectedScreening.id,
    }) : [];

    if (overlaps.length) {
      setError('A módosított teljes időtartam film + reklám + előzetes + takarítás alapján ütközne egy másik vetítéssel ugyanabban a teremben, ezért nem menthető.');
      return;
    }

    const next = {
      ...meta,
      [selectedId]: {
        date: form.date || todayDateValue(),
        ...schedulePayloadFromForm(form),
      },
    };
    saveScheduleMeta(next);
    setMeta(next);
    setMessage('Showtime ütemezés mentve.');
    setError('');
  }

  async function deleteShowtime(screeningOrId) {
    const screeningId = typeof screeningOrId === 'object' ? screeningOrId?.id : screeningOrId;
    if (!screeningId) {
      setError('Válassz törölhető vetítést.');
      return;
    }

    const screening = scheduleScreenings.find((item) => idsEqual(item.id, screeningId)) || (typeof screeningOrId === 'object' ? screeningOrId : null);
    const movie = getScreeningMovie(screening, data.movies);
    const hall = getScreeningHall(screening, data.halls);
    const confirmed = window.confirm(`Biztosan törlöd ezt a vetítést?\n${movie?.name || 'Film'} · ${getScreeningDate(screening, meta)} · ${timeToText(screening?.time)} · ${hall?.name || '-'}`);
    if (!confirmed) return;

    setError('');
    setMessage('');

    const nextMeta = { ...meta };
    delete nextMeta[screeningId];

    try {
      if (screening?.originalScreeningId) {
        rememberDeletedScreeningOccurrence(screening, meta);
        saveReservations(getReservations().filter((reservation) => !idsEqual(reservation.screeningId, screeningId)));
        saveScheduleMeta(nextMeta);
        setMeta(nextMeta);
        setDeletedKeys(getDeletedScreeningOccurrences());
        setSelectedId('');
        setForm({ ...defaultScheduleMeta, date: todayDateValue() });
        setMessage('A kiválasztott napi vetítés törölve. Ez csak azt a napot rejti el, a többi napi vetítés megmarad.');
        return;
      }

      const numericBackendId = Number(screeningId);
      const localOnly = screening?.localOnly || !Number.isInteger(numericBackendId);

      if (!localOnly) {
        await apiRequest(`/screening/${screeningId}`, { method: 'DELETE' }, auth.token);
      }

      forgetLocalScreening(screeningId);
      saveReservations(getReservations().filter((reservation) => !idsEqual(reservation.screeningId, screeningId)));
      saveScheduleMeta(nextMeta);
      setMeta(nextMeta);
      setDeletedKeys(getDeletedScreeningOccurrences());
      setSelectedId('');
      setForm({ ...defaultScheduleMeta, date: todayDateValue() });
      setMessage('Vetítés törölve. A hozzá tartozó helyi foglalások is törlődtek, és a felhasználói műsorban sem jelenik meg tovább.');
      await loadData();
    } catch (err) {
      if (screening?.localOnly) {
        forgetLocalScreening(screeningId);
        saveReservations(getReservations().filter((reservation) => !idsEqual(reservation.screeningId, screeningId)));
        saveScheduleMeta(nextMeta);
        setMeta(nextMeta);
        setDeletedKeys(getDeletedScreeningOccurrences());
        setSelectedId('');
        setForm({ ...defaultScheduleMeta, date: todayDateValue() });
        setData((current) => ({
          ...current,
          screenings: current.screenings.filter((item) => !idsEqual(item.id, screeningId)),
        }));
        setMessage('A helyi vetítés és a hozzá tartozó helyi foglalások törölve.');
        return;
      }
      setError(err.message);
    }
  }

  const visibleScheduleScreenings = scheduleFilterDate
    ? scheduleScreenings.filter((screening) => getScreeningDate(screening, meta) === scheduleFilterDate)
    : scheduleScreenings;

  const rows = visibleScheduleScreenings.map((screening) => {
    const movie = getScreeningMovie(screening, data.movies);
    const hall = getScreeningHall(screening, data.halls);
    const info = getScheduleInfo(screening.id, meta);
    return {
      id: screening.id,
      movie: movie?.name || `Film #${screening.movie_id}`,
      hall: hall?.name || '-',
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
        <div className="card-title-row">
          <div>
            <h3>Új showtime létrehozása</h3>
            <p className="muted">Az Admin / Filmek fülön létrehozott új filmek itt választhatók ki, és ebből jön létre az új vetítés a backendben.</p>
          </div>
          <button type="button" onClick={loadData}>Filmek/termek frissítése</button>
        </div>
        <form className="grid-form" onSubmit={createShowtime}>
          <label>
            Film
            <select value={newForm.movie_id} onChange={(e) => setNewForm({ ...newForm, movie_id: e.target.value })} required>
              <option value="">Válassz filmet...</option>
              {data.movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.name}</option>)}
            </select>
          </label>
          <label>
            Terem
            <select
              value={newForm.hall_id}
              onChange={(e) => {
                const hall = data.halls.find((item) => idsEqual(item.id ?? item.hall_id, e.target.value));
                setNewForm({ ...newForm, hall_id: e.target.value });
              }}
              required
            >
              <option value="">Válassz termet...</option>
              {data.halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name} · {Math.min(Number(hall.capacity) || MAX_HALL_CAPACITY, MAX_HALL_CAPACITY)} hely</option>)}
            </select>
          </label>
          <label>Dátum<input type="date" min={todayDateValue()} value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: isPastDateValue(e.target.value) ? todayDateValue() : e.target.value })} required /></label>
          <label>Kezdés, pl. 1800<input type="number" min="0" max="2359" value={newForm.time} onChange={(e) => setNewForm({ ...newForm, time: e.target.value })} required /></label>
          <label>Film hossza percben<input type="number" min="1" value={newForm.movieRuntime} onChange={(e) => setNewForm({ ...newForm, movieRuntime: e.target.value })} /></label>
          <label>Reklám perc<input type="number" min="0" value={newForm.ads} onChange={(e) => setNewForm({ ...newForm, ads: e.target.value })} /></label>
          <label>Előzetes perc<input type="number" min="0" value={newForm.trailers} onChange={(e) => setNewForm({ ...newForm, trailers: e.target.value })} /></label>
          <label>Takarítás perc<input type="number" min="0" value={newForm.cleaning} onChange={(e) => setNewForm({ ...newForm, cleaning: e.target.value })} /></label>
          <div className="form-actions"><button className="primary" type="submit">Új vetítés létrehozása</button></div>
        </form>
      </section>

      <section className="card">
        <h3>Meglévő vetítés időadatai</h3>
        <p className="muted">Itt a már létrehozott vetítések dátuma, reklámideje, előzetese és takarítása módosítható.</p>
        <form className="grid-form" onSubmit={saveMeta}>
          <label>
            Vetítés
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Válassz...</option>
              {scheduleScreenings.map((screening) => {
                const movie = getScreeningMovie(screening, data.movies);
                const hall = getScreeningHall(screening, data.halls);
                return <option key={screening.id} value={screening.id}>{movie?.name || screening.movie_id} · {getScreeningDate(screening, meta)} · {timeToText(screening.time)} · {hall?.name || '-'}</option>;
              })}
            </select>
          </label>
          <label>Vetítés dátuma<input type="date" min={todayDateValue()} value={form.date || todayDateValue()} onChange={(e) => setForm({ ...form, date: isPastDateValue(e.target.value) ? todayDateValue() : e.target.value })} /></label>
          <label>Film hossza percben<input type="number" min="1" value={form.movieRuntime} onChange={(e) => setForm({ ...form, movieRuntime: e.target.value })} /></label>
          <label>Reklám perc<input type="number" min="0" value={form.ads} onChange={(e) => setForm({ ...form, ads: e.target.value })} /></label>
          <label>Előzetes perc<input type="number" min="0" value={form.trailers} onChange={(e) => setForm({ ...form, trailers: e.target.value })} /></label>
          <label>Takarítás perc<input type="number" min="0" value={form.cleaning} onChange={(e) => setForm({ ...form, cleaning: e.target.value })} /></label>
          <div className="form-actions">
            <button className="primary" type="submit">Mentés</button>
            <button className="danger" type="button" disabled={!selectedId} onClick={() => deleteShowtime(selectedId)}>Kiválasztott vetítés törlése</button>
          </div>
        </form>
      </section>
      <section className="card">
        <div className="card-title-row">
          <div>
            <h3>Összes jövőbeli ütemezési táblázat</h3>
            <p className="muted">A táblázatból közvetlenül törölhető bármelyik napi vetítés, nem csak a mai nap.</p>
          </div>
          <span className="badge">{rows.length} vetítés</span>
        </div>
        <div className="search-bar">
          <label>
            Dátum szűrés
            <input type="date" min={todayDateValue()} value={scheduleFilterDate} onChange={(e) => setScheduleFilterDate(e.target.value)} />
          </label>
          {scheduleFilterDate && <button type="button" onClick={() => setScheduleFilterDate('')}>Minden nap mutatása</button>}
        </div>
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
          actions={(row) => <button className="danger" type="button" onClick={() => deleteShowtime(row.id)}>Törlés</button>}
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

  const selectedHall = halls.find((hall) => idsEqual(hall.id ?? hall.hall_id, selectedHallId));
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

  function imageut() {
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
      <Header auth={auth} activePage={activePage} setActivePage={setActivePage} onLogout={imageut} />
      {page}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
