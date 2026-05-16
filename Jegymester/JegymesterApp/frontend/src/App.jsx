import React, { useEffect, useMemo, useState } from 'react';
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
  resources,
  SCHEDULE_META_KEY,
  ticketCategories,
  moviePosterByTitle,
} from './config/appConfig';
import { readStorage, writeStorage } from './utils/storage';

import {
  getValue,
  isMovieImageField,
  normalizeSearchText,
  normalizeMovieTitle,
  getMoviePosterByTitle,
  normalizeId,
  idsEqual,
  getMovieImageUrl,
  getMovieInitials,
  moviePayloadForBackend,
  filterRows,
  normalizePayload,
  getReservations,
  saveReservations,
  getHallConfigs,
  saveHallConfigs,
  getScheduleMeta,
  saveScheduleMeta,
  getDeletedScreeningOccurrences,
  saveDeletedScreeningOccurrences,
  getScreeningTemplateId,
  getExplicitScreeningDate,
  getScreeningOccurrenceKey,
  isScreeningOccurrenceDeleted,
  rememberDeletedScreeningOccurrence,
  getLocalMovies,
  notifyLocalCatalogChanged,
  saveLocalMovies,
  getLocalScreenings,
  saveLocalScreenings,
  mergeById,
  rememberLocalMovie,
  forgetLocalMovie,
  rememberLocalScreening,
  forgetLocalScreening,
  isCashier,
  isCashierOnly,
  isRegularUser,
  getScreeningMovie,
  getScreeningHallId,
  getScreeningHall,
  timeToText,
  getDayPart,
  createReservationCode,
  getHallEffectiveCapacity,
  generateSeats,
  getTakenSeats,
  getSeatReservations,
  getReservedSeatsText,
  getFreeSeats,
  getAvailabilitySummary,
  normalizeTicketCount,
  calculateTotal,
  getScheduleInfo,
  getScheduleSlotBounds,
  scheduleSlotsOverlap,
  makeValidationError,
  todayDateValue,
  dateValueAfterDays,
  getScreeningDate,
  compareScreeningsByDateTime,
  asArray,
  normalizeCatalogData,
  createAutoScreeningsForMovies,
  syntheticScreeningId,
  getScheduleInfoForScreening,
  resolveCatalogHallConflicts,
  getCollisionFreeScreeningsForUser,
  buildDailyCatalog,
  dateHashForScreeningId,
  uniqueScreeningTemplates,
  screeningsCoveringDate,
  availableScheduleDates,
  formatDateHu,
  getScreeningDateTimeFromParts,
  isPastDateValue,
  isScreeningInPast,
  isUpcomingScreening,
  getUpcomingScreenings,
  handleFutureDateFilter,
  getReservationScreeningDateTime,
  isReservationStillValid,
  canCancelTicketOrder,
  cancelWindowText,
  getOrderStatusLabel,
  getProfileOverrides,
  saveProfileOverride,
  getDisplayUser,
  buildPaymentFormFromAuth,
  digitsOnly,
  formatCardNumber,
  formatCardExpiry,
  isValidPaymentForm,
  getOrderEmailAddress,
  buildFeedbackEmailText,
  openFeedbackEmail,
  loadCatalogData,
  makeTicketOrder,
} from './utils/jegymesterHelpers';
import { DataTable, Header, Message, MoviePoster, SeatGrid } from './components/common';


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

export default App;
