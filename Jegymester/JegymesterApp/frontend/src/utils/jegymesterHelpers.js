import { apiRequest, getRole } from '../api';
import {
  AUTO_SCREENING_ID_BASE,
  DELETED_SCREENING_OCCURRENCES_KEY,
  defaultScheduleMeta,
  HALL_CONFIG_KEY,
  LOCAL_MOVIES_KEY,
  LOCAL_SCREENINGS_KEY,
  MAX_HALL_CAPACITY,
  PROFILE_OVERRIDES_KEY,
  PUBLIC_DAYS_AHEAD,
  publicDemoData,
  RESERVATIONS_KEY,
  SCHEDULE_META_KEY,
  ticketCategories,
  moviePosterByTitle,
} from '../config/appConfig';
import { readStorage, writeStorage } from './storage';

export function getValue(row, path) {
  return path.split('.').reduce((value, key) => value?.[key], row);
}

export function isMovieImageField(key) {
  return ['image_url', 'imageUrl', 'image', 'poster_url', 'posterUrl', 'poster'].includes(key);
}

export function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase().trim();
}

export function normalizeMovieTitle(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getMoviePosterByTitle(movie) {
  const title = normalizeMovieTitle(movie?.name || movie?.title || movie?.film || '');
  if (!title) return '';
  return moviePosterByTitle.find((poster) => poster.titles.some((name) => title.includes(normalizeMovieTitle(name))))?.src || '';
}

export function normalizeId(value) {
  return String(value ?? '').trim();
}

export function idsEqual(left, right) {
  return normalizeId(left) !== '' && normalizeId(left) === normalizeId(right);
}

export function getMovieImageUrl(movie) {
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

export function getMovieInitials(movie) {
  const name = String(movie?.name || movie?.title || 'JM').trim();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'JM';
}

export function moviePayloadForBackend(payload) {
  return {
    name: payload.name,
    description: payload.description,
  };
}

export function filterRows(rows, searchText, fields) {
  const query = normalizeSearchText(searchText);

  if (!query || !fields?.length) {
    return rows;
  }

  return rows.filter((row) =>
    fields.some((field) => normalizeSearchText(getValue(row, field)).includes(query))
  );
}

export function normalizePayload(form) {
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

export function getReservations() {
  return readStorage(RESERVATIONS_KEY, []);
}

export function saveReservations(reservations) {
  const normalized = (reservations || []).map((reservation) => ({
    ...reservation,
    seats: Array.isArray(reservation?.seats) ? reservation.seats : [],
  }));
  writeStorage(RESERVATIONS_KEY, normalized);
  window.dispatchEvent(new Event('jegymester-reservations-changed'));
}

export function getHallConfigs() {
  return readStorage(HALL_CONFIG_KEY, {});
}

export function saveHallConfigs(configs) {
  writeStorage(HALL_CONFIG_KEY, configs);
}

export function getScheduleMeta() {
  return readStorage(SCHEDULE_META_KEY, {});
}

export function saveScheduleMeta(meta) {
  writeStorage(SCHEDULE_META_KEY, meta);
}

export function getDeletedScreeningOccurrences() {
  return readStorage(DELETED_SCREENING_OCCURRENCES_KEY, []);
}

export function saveDeletedScreeningOccurrences(keys) {
  const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)));
  writeStorage(DELETED_SCREENING_OCCURRENCES_KEY, uniqueKeys);
  notifyLocalCatalogChanged();
}

export function getScreeningTemplateId(screening) {
  return screening?.originalScreeningId ?? screening?.id;
}

export function getExplicitScreeningDate(screening, meta = getScheduleMeta()) {
  return screening?.date || meta?.[screening?.id]?.date || null;
}

export function getScreeningOccurrenceKey(screening, meta = getScheduleMeta()) {
  const templateId = normalizeId(getScreeningTemplateId(screening));
  const date = getExplicitScreeningDate(screening, meta) || getScreeningDate(screening, meta);
  const time = normalizeId(screening?.time);
  return templateId && date ? `${templateId}|${date}|${time}` : '';
}

export function isScreeningOccurrenceDeleted(screening, meta = getScheduleMeta()) {
  const key = getScreeningOccurrenceKey(screening, meta);
  return key ? getDeletedScreeningOccurrences().includes(key) : false;
}

export function rememberDeletedScreeningOccurrence(screening, meta = getScheduleMeta()) {
  const key = getScreeningOccurrenceKey(screening, meta);
  if (!key) return '';
  saveDeletedScreeningOccurrences([...getDeletedScreeningOccurrences(), key]);
  return key;
}


export function getLocalMovies() {
  return readStorage(LOCAL_MOVIES_KEY, []);
}

export function notifyLocalCatalogChanged() {
  window.dispatchEvent(new Event('jegymester-local-catalog-changed'));
}

export function saveLocalMovies(movies) {
  writeStorage(LOCAL_MOVIES_KEY, movies);
  notifyLocalCatalogChanged();
}

export function getLocalScreenings() {
  return readStorage(LOCAL_SCREENINGS_KEY, []);
}

export function saveLocalScreenings(screenings) {
  writeStorage(LOCAL_SCREENINGS_KEY, screenings);
  notifyLocalCatalogChanged();
}

export function mergeById(primary = [], extra = []) {
  const map = new Map();
  [...primary, ...extra].forEach((item) => {
    if (!item) return;
    const id = item.id ?? item.movie_id ?? item.hall_id;
    if (id === undefined || id === null || id === '') return;
    map.set(String(id), { ...(map.get(String(id)) || {}), ...item });
  });
  return Array.from(map.values());
}

export function rememberLocalMovie(movie) {
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

export function forgetLocalMovie(movieId) {
  if (!movieId) return;
  saveLocalMovies(getLocalMovies().filter((movie) => String(movie.id) !== String(movieId)));
  saveLocalScreenings(getLocalScreenings().filter((screening) => String(screening.movie_id) !== String(movieId)));
}

export function rememberLocalScreening(screening) {
  if (!screening) return null;
  const normalized = {
    ...screening,
    id: screening.id ?? `local-screening-${Date.now()}`,
  };
  saveLocalScreenings(mergeById(getLocalScreenings(), [normalized]));
  return normalized;
}

export function forgetLocalScreening(screeningId) {
  if (!screeningId) return;
  saveLocalScreenings(getLocalScreenings().filter((screening) => String(screening.id) !== String(screeningId)));
}

export function isCashier(auth) {
  const role = getRole(auth);
  return role === 'penztaros' || role === 'adminisztrator';
}

export function isCashierOnly(auth) {
  return getRole(auth) === 'penztaros';
}

export function isRegularUser(auth) {
  return getRole(auth) === 'felhasznalo';
}

export function getScreeningMovie(screening, movies = []) {
  const movieId = screening?.movie_id ?? screening?.movie?.id ?? screening?.movie?.movie_id;
  return screening?.movie || movies.find((movie) => idsEqual(movie.id ?? movie.movie_id, movieId)) || null;
}

export function getScreeningHallId(screening) {
  return screening?.hall_id ?? screening?.hall?.id ?? screening?.hall?.hall_id;
}

export function getScreeningHall(screening, halls = []) {
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

export function timeToText(time) {
  const raw = String(time ?? '').padStart(4, '0');
  if (raw.length === 4) {
    return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  }
  return String(time ?? '-');
}

export function getDayPart(time) {
  const hour = Number(String(time ?? '0').padStart(4, '0').slice(0, 2));
  if (hour < 12) return 'délelőtt';
  if (hour < 18) return 'délután';
  return 'este';
}

export function createReservationCode() {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `JM-${Date.now().toString().slice(-5)}-${random}`;
}

export function getHallEffectiveCapacity(hall, hallConfigs = getHallConfigs()) {
  const rawCapacity = Number(hall?.capacity || MAX_HALL_CAPACITY);
  const configured = Number(hallConfigs?.[hall?.id]?.capacity || rawCapacity);
  return Math.max(1, Math.min(MAX_HALL_CAPACITY, configured || rawCapacity || MAX_HALL_CAPACITY));
}

export function generateSeats(capacity) {
  const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: capacity }, (_, index) => {
    const row = rowLetters[Math.floor(index / 10)] || 'Z';
    const number = (index % 10) + 1;
    return `${row}${number}`;
  });
}

export function getTakenSeats(screeningId, reservations = getReservations()) {
  return reservations
    .filter((reservation) => idsEqual(reservation.screeningId, screeningId) && reservation.status !== 'cancelled')
    .flatMap((reservation) => reservation.seats || []);
}

export function getSeatReservations(screeningId, reservations = getReservations()) {
  return reservations
    .filter((reservation) => idsEqual(reservation.screeningId, screeningId) && reservation.status !== 'cancelled')
    .flatMap((reservation) => (reservation.seats || []).map((seat) => ({
      reservation,
      seat,
    })));
}

export function getReservedSeatsText(screeningId, reservations = getReservations()) {
  const seats = getSeatReservations(screeningId, reservations).map(({ seat }) => seat);
  return seats.length ? seats.join(', ') : '-';
}

export function getFreeSeats(screeningId, hall, reservations, hallConfigs) {
  const hallConfig = hallConfigs?.[hall?.id] || {};
  const allSeats = generateSeats(getHallEffectiveCapacity(hall, hallConfigs));
  const taken = new Set(getTakenSeats(screeningId, reservations));
  const closed = new Set(hallConfig.closedSeats || []);
  return allSeats.filter((seat) => !taken.has(seat) && !closed.has(seat));
}

export function getAvailabilitySummary(screening, hall, reservations = getReservations(), hallConfigs = getHallConfigs()) {
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

export function normalizeTicketCount(value, max = MAX_HALL_CAPACITY) {
  const numeric = Math.floor(Number(value));
  const safeMax = Math.max(1, Number(max) || 1);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.min(safeMax, numeric);
}

export function calculateTotal(categoryKey, seats, hallConfig = {}) {
  const category = ticketCategories[categoryKey] || ticketCategories.adult;
  const count = seats.length;
  const vipSeats = new Set(hallConfig.vipSeats || []);
  const vipExtra = seats.filter((seat) => vipSeats.has(seat)).length * 600;

  if (categoryKey === 'family' && count >= 4) {
    return category.familyBase + Math.max(0, count - 4) * category.familyExtra + vipExtra;
  }

  return count * category.price + vipExtra;
}

export function getScheduleInfo(screeningId, meta = getScheduleMeta()) {
  const saved = meta?.[screeningId] || {};
  const merged = { ...defaultScheduleMeta, ...saved };
  return {
    ...merged,
    total: Number(merged.movieRuntime || 0) + Number(merged.ads || 0) + Number(merged.trailers || 0),
    roomBlocked: Number(merged.movieRuntime || 0) + Number(merged.ads || 0) + Number(merged.trailers || 0) + Number(merged.cleaning || 0),
  };
}

export function getScheduleSlotBounds(dateValue, timeValue, scheduleInfo) {
  const start = getScreeningDateTimeFromParts(dateValue, timeValue);
  const blockedMinutes = Math.max(1, Number(scheduleInfo?.roomBlocked || 0));
  const end = new Date(start.getTime() + blockedMinutes * 60 * 1000);
  return { start, end };
}

export function scheduleSlotsOverlap(left, right) {
  if (!left || !right) return false;
  if (Number.isNaN(left.start?.getTime()) || Number.isNaN(left.end?.getTime())) return false;
  if (Number.isNaN(right.start?.getTime()) || Number.isNaN(right.end?.getTime())) return false;
  return left.start < right.end && left.end > right.start;
}

export function makeValidationError(message) {
  const error = new Error(message);
  error.isValidationError = true;
  return error;
}


export function todayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateValueAfterDays(days = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function getScreeningDate(screening, meta = getScheduleMeta()) {
  return getExplicitScreeningDate(screening, meta) || todayDateValue();
}

export function compareScreeningsByDateTime(left, right) {
  const leftDate = getScreeningDate(left);
  const rightDate = getScreeningDate(right);
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return Number(left?.time || 0) - Number(right?.time || 0);
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

export function normalizeCatalogData(rawData = {}) {
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

export function createAutoScreeningsForMovies(catalog) {
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

export function syntheticScreeningId(screening, dayIndex, position) {
  const base = Number(screening?.id);
  if (Number.isFinite(base)) return base * 1000 + dayIndex * 50 + position;
  const fallback = String(screening?.id || `${screening?.movie_id || 'x'}-${position}`)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 9000000 + fallback * 100 + dayIndex * 50 + position;
}

export function getScheduleInfoForScreening(screening, meta = getScheduleMeta()) {
  const ownInfo = getScheduleInfo(screening?.id, meta);
  const templateId = screening?.originalScreeningId;
  if (!templateId || meta?.[screening?.id]) return ownInfo;
  return getScheduleInfo(templateId, meta);
}

export function resolveCatalogHallConflicts(catalog, screenings, scheduleMeta = getScheduleMeta()) {
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

export function getCollisionFreeScreeningsForUser(catalog, screenings, scheduleMeta = getScheduleMeta()) {
  // A user oldalon ez a végső biztonsági ellenőrzés: minden megjelenítés előtt
  // dátum + terem + teljes blokkolt idő alapján újraosztjuk a termeket.
  return resolveCatalogHallConflicts(catalog, screenings, scheduleMeta).screenings;
}

export function buildDailyCatalog(rawData, days = PUBLIC_DAYS_AHEAD) {
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

export function dateHashForScreeningId(dateValue) {
  return String(dateValue || todayDateValue())
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function uniqueScreeningTemplates(screenings = []) {
  const seen = new Set();
  return screenings.filter((screening) => {
    const templateId = screening.originalScreeningId ?? screening.id;
    const key = normalizeId(templateId);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function screeningsCoveringDate(catalog, targetDate) {
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

export function availableScheduleDates(days = PUBLIC_DAYS_AHEAD) {
  return Array.from({ length: Math.max(1, Number(days) || 1) }, (_, index) => dateValueAfterDays(index));
}

export function formatDateHu(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('hu-HU', { month: 'short', day: '2-digit', weekday: 'short' });
}

export function getScreeningDateTimeFromParts(dateValue, timeValue) {
  const date = dateValue || todayDateValue();
  const raw = String(timeValue ?? '0').padStart(4, '0');
  const hour = raw.slice(0, 2);
  const minute = raw.slice(2, 4);
  return new Date(`${date}T${hour}:${minute || '00'}:00`);
}

export function isPastDateValue(dateValue) {
  if (!dateValue) return false;
  return String(dateValue) < todayDateValue();
}

export function isScreeningInPast(screening, meta = getScheduleMeta()) {
  if (!screening) return false;
  const screeningDate = getScreeningDate(screening, meta);
  const screeningAt = getScreeningDateTimeFromParts(screeningDate, screening?.time);
  if (Number.isNaN(screeningAt.getTime())) return false;
  return screeningAt.getTime() <= Date.now();
}

export function isUpcomingScreening(screening, meta = getScheduleMeta()) {
  if (!screening) return false;
  const screeningDate = getScreeningDate(screening, meta);

  // A publikus műsorban és a vendégvásárlásnál múltbeli nap nem jelenhet meg.
  // Mai dátumnál a már elkezdődött vetítést is elrejtjük.
  if (isPastDateValue(screeningDate)) return false;
  return !isScreeningInPast(screening, meta);
}

export function getUpcomingScreenings(screenings = [], meta = getScheduleMeta()) {
  return (screenings || []).filter((screening) => isUpcomingScreening(screening, meta));
}

export function handleFutureDateFilter(value, setFilters, filters, setError) {
  if (isPastDateValue(value)) {
    setFilters({ ...filters, date: todayDateValue() });
    if (setError) setError('Elmúlt dátumra nem lehet jegyet foglalni vagy vásárolni. A dátumot a mai napra állítottam.');
    return;
  }
  setFilters({ ...filters, date: value });
}

export function getReservationScreeningDateTime(reservation) {
  return getScreeningDateTimeFromParts(reservation?.screeningDate, reservation?.time);
}

export function isReservationStillValid(reservation) {
  if (!reservation || reservation.status === 'cancelled') return false;
  const screeningAt = getReservationScreeningDateTime(reservation);

  if (Number.isNaN(screeningAt.getTime())) {
    return !isPastDateValue(reservation?.screeningDate);
  }

  return screeningAt.getTime() >= Date.now();
}

export function canCancelTicketOrder(reservation) {
  const screeningAt = getReservationScreeningDateTime(reservation);
  if (Number.isNaN(screeningAt.getTime())) return true;
  return screeningAt.getTime() - Date.now() >= 4 * 60 * 60 * 1000;
}

export function cancelWindowText(reservation) {
  const screeningAt = getReservationScreeningDateTime(reservation);
  if (Number.isNaN(screeningAt.getTime())) return 'Időpont nem értelmezhető.';
  const diffHours = Math.floor((screeningAt.getTime() - Date.now()) / (60 * 60 * 1000));
  return diffHours >= 4
    ? `Törölhető, még kb. ${diffHours} óra van hátra.`
    : 'Nem törölhető: a vetítés kezdete előtt 4 órán belül van.';
}

export function getOrderStatusLabel(reservation) {
  if (reservation.status === 'paid') return 'megvásárolva / fizetve';
  if (reservation.status === 'reserved') return 'lefoglalva';
  if (reservation.status === 'cancelled') return 'törölve / sztornózva';
  return reservation.status || '-';
}

export function getProfileOverrides() {
  return readStorage(PROFILE_OVERRIDES_KEY, {});
}

export function saveProfileOverride(userId, profile) {
  const overrides = getProfileOverrides();
  const next = { ...overrides, [userId]: profile };
  writeStorage(PROFILE_OVERRIDES_KEY, next);
  return next;
}

export function getDisplayUser(auth) {
  if (!auth?.user?.id) return auth?.user || {};
  const override = getProfileOverrides()[auth.user.id] || {};
  return { ...auth.user, ...override };
}

export function buildPaymentFormFromAuth(auth) {
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

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function formatCardNumber(value) {
  return digitsOnly(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

export function formatCardExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function isValidPaymentForm(form) {
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


export function getOrderEmailAddress(order, auth, buyerInfo = {}) {
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

export function buildFeedbackEmailText(order, type = 'reservation') {
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

export function openFeedbackEmail(order, type, auth, buyerInfo = {}) {
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

export async function loadCatalogData(token = null, useDemoOnError = false) {
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

export function makeTicketOrder({
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

