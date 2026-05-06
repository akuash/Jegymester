import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  apiRequest,
  clearAuth,
  getCurrentUserId,
  getMe,
  getRole,
  getSavedAuth,
  isAdmin,
  login,
  registerUser,
  safeRequest,
  saveAuth,
} from './api';
import './style.css';

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
      ['name', 'Film neve', 'text', true],
      ['description', 'Leírás', 'textarea', false],
    ],
    search: {
      label: 'Film keresése',
      placeholder: 'Keresés film címe vagy leírása alapján...',
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
      ['capacity', 'Férőhely'],
    ],
    emptyForm: { name: '', capacity: '' },
    fields: [
      ['name', 'Terem neve', 'text', true],
      ['capacity', 'Férőhely', 'number', true],
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
      ['time', 'Idő', 'number', true],
      ['place', 'Hely', 'text', true],
      ['movie_id', 'Film ID', 'number', true],
      ['hall_id', 'Terem ID', 'number', true],
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
      ['cost', 'Ár', 'number', true],
      ['screening_id', 'Vetítés ID', 'number', true],
      ['user_id', 'Felhasználó ID (üresen hagyható)', 'number', false],
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

const demoUsers = [
  { label: 'Admin', email: 'admin@jegymester.hu', password: 'admin123' },
  { label: 'Pénztáros', email: 'cashier@jegymester.hu', password: 'cashier123' },
  { label: 'Felhasználó', email: 'user@jegymester.hu', password: 'user123' },
];

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
  const numberFields = ['capacity', 'time', 'movie_id', 'hall_id', 'cost', 'screening_id', 'user_id'];

  Object.entries(form).forEach(([key, rawValue]) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

    if (value === '') {
      payload[key] = null;
      return;
    }

    payload[key] = numberFields.includes(key) ? Number(value) : value;
  });

  return payload;
}

function buildAuthFromLoginResponse(response) {
  const token = response?.access_token || response?.token || response?.jwt;

  if (!token) {
    throw new Error('A backend nem adott vissza JWT tokent. Ellenőrizd a /api/user/login választ.');
  }

  return {
    token,
    tokenType: response.token_type || 'Bearer',
    expiresIn: response.expires_in,
    user: response.user,
  };
}

function Message({ message, type = 'info' }) {
  if (!message) return null;
  return <div className={`message ${type}`}>{message}</div>;
}

function ErrorList({ errors }) {
  const items = Object.entries(errors || {}).filter(([, value]) => Boolean(value));

  if (items.length === 0) return null;

  return (
    <section className="message error small-message">
      <strong>Nem minden adat töltődött be:</strong>
      <ul>
        {items.map(([key, value]) => (
          <li key={key}>{resources[key]?.label || key}: {value}</li>
        ))}
      </ul>
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
      const auth = buildAuthFromLoginResponse(response);
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
      await registerUser({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        phone: registerForm.phone.trim(),
        password: registerForm.password,
      });
      setSuccess('Sikeres regisztráció. Most jelentkezz be az e-mail címmel és jelszóval.');
      setMode('login');
      setLoginForm({ email: registerForm.email.trim(), password: '' });
      setRegisterForm({ name: '', email: '', password: '', phone: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemoUser(user) {
    setMode('login');
    setError('');
    setSuccess('');
    setLoginForm({ email: user.email, password: user.password });
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>JegyMester</h1>
        <p className="muted">A frontend a Python backend REST API végpontjait hívja, és csak érvényes JWT tokennel enged tovább.</p>

        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Bejelentkezés</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Regisztráció</button>
        </div>

        <Message message={error} type="error" />
        <Message message={success} type="success" />

        {mode === 'login' ? (
          <>
            <div className="demo-users">
              <span className="muted">Gyors kitöltés:</span>
              {demoUsers.map((user) => (
                <button key={user.email} type="button" onClick={() => fillDemoUser(user)}>{user.label}</button>
              ))}
            </div>

            <form onSubmit={handleLogin} className="form">
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="email"
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
                  autoComplete="current-password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="admin123"
                />
              </label>
              <button className="primary" disabled={loading}>{loading ? 'Belépés...' : 'Belépés JWT tokennel'}</button>
            </form>
          </>
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
              <input required minLength="3" value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} />
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
  const role = getRole(auth);
  const admin = isAdmin(auth);

  return (
    <header className="app-header">
      <div>
        <h1>JegyMester Frontend</h1>
        <p>{auth.user?.name || 'Felhasználó'} · <strong>{role || 'nincs szerepkör'}</strong></p>
      </div>
      <nav>
        <button type="button" className={activePage === 'home' ? 'active' : ''} onClick={() => setActivePage('home')}>Kezdőlap</button>
        {admin && <button type="button" className={activePage === 'admin' ? 'active' : ''} onClick={() => setActivePage('admin')}>Admin kezelő</button>}
        <button type="button" onClick={onLogout}>Kijelentkezés</button>
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
            <tr key={row.id}>
              {columns.map(([key]) => {
                const value = getValue(row, key);
                return <td key={key}>{formatCellValue(value)}</td>;
              })}
              {actions && <td className="actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCellValue(value) {
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function ResourceBlock({ title, config, rows, error, actions }) {
  const [searchText, setSearchText] = useState('');
  const filteredRows = useMemo(
    () => filterRows(rows, searchText, config.search?.fields),
    [rows, searchText, config.search]
  );

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>{title}</h3>
        <span className="muted">Találatok: {filteredRows.length} / {rows.length}</span>
      </div>

      {error && <Message message={error} type="error" />}

      {config.search && (
        <div className="search-bar">
          <label>
            {config.search.label || 'Keresés'}
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

      <DataTable columns={config.columns} rows={filteredRows} actions={actions} />
    </section>
  );
}

function HomePage({ auth }) {
  const token = auth.token;
  const userId = getCurrentUserId(auth);
  const [data, setData] = useState({ movies: [], halls: [], screenings: [], myTickets: [] });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadHomeData() {
    setErrors({});
    setMessage('');
    setLoading(true);

    const requests = {
      movies: safeRequest('/movie/', {}, token),
      halls: safeRequest('/hall/', {}, token),
      screenings: safeRequest('/screening/', {}, token),
      myTickets: userId ? safeRequest(`/ticket/user/${userId}`, {}, token) : Promise.resolve({ ok: true, data: [] }),
    };

    const results = await Promise.all(Object.entries(requests).map(async ([key, promise]) => [key, await promise]));
    const nextData = { movies: [], halls: [], screenings: [], myTickets: [] };
    const nextErrors = {};

    results.forEach(([key, result]) => {
      if (result.ok) {
        nextData[key] = Array.isArray(result.data) ? result.data : [];
      } else {
        nextErrors[key] = result.error;
      }
    });

    setData(nextData);
    setErrors(nextErrors);
    setLoading(false);
  }

  async function cancelMyTicket(ticketId) {
    const confirmed = window.confirm(`Biztosan lemondod/törlöd ezt a jegyet? ID: ${ticketId}`);
    if (!confirmed) return;

    setMessage('');
    const result = await safeRequest(`/ticket/${ticketId}/cancel`, { method: 'DELETE' }, token);
    if (result.ok) {
      setMessage('A jegy sikeresen törölve lett.');
      await loadHomeData();
    } else {
      setErrors((current) => ({ ...current, myTickets: result.error }));
    }
  }

  useEffect(() => {
    loadHomeData();
  }, [auth.token, userId]);

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Kezdőlap</h2>
          <p>Minden bejelentkezett felhasználó látja. Az admin műveletek csak adminisztrátor szerepkörrel jelennek meg.</p>
        </div>
        <button type="button" onClick={loadHomeData}>Frissítés</button>
      </section>

      <Message message={message} type="success" />
      <ErrorList errors={errors} />

      {loading ? <p>Adatok betöltése...</p> : (
        <>
          <ResourceBlock title="Filmek" config={resources.movies} rows={data.movies} error={errors.movies} />
          <ResourceBlock title="Termek" config={resources.halls} rows={data.halls} error={errors.halls} />
          <ResourceBlock title="Vetítések" config={resources.screenings} rows={data.screenings} error={errors.screenings} />
          <ResourceBlock
            title="Saját jegyeim"
            config={resources.tickets}
            rows={data.myTickets}
            error={errors.myTickets}
            actions={(row) => <button type="button" className="danger" onClick={() => cancelMyTicket(row.id)}>Jegy törlése</button>}
          />
        </>
      )}
    </main>
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

  const config = resources[active];
  const filteredRows = useMemo(
    () => filterRows(rows, searchText, config.search?.fields),
    [rows, searchText, config.search]
  );

  async function loadRows() {
    setError('');
    setLoading(true);

    const result = await safeRequest(config.endpoint, {}, token);
    if (result.ok) {
      setRows(Array.isArray(result.data) ? result.data : []);
    } else {
      setError(result.error);
      setRows([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    setForm(config.emptyForm || {});
    setEditingId(null);
    setMessage('');
    setError('');
    setSearchText('');
    loadRows();
  }, [active]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const payload = normalizePayload(form);
      const method = editingId ? 'PUT' : 'POST';
      const path = editingId ? `${config.endpoint}${editingId}` : config.endpoint;
      await apiRequest(path, { method, body: payload }, token);
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

  async function ticketAction(path, method, successText) {
    setError('');
    setMessage('');

    const result = await safeRequest(path, { method }, token);
    if (result.ok) {
      setMessage(successText);
      await loadRows();
    } else {
      setError(result.error);
    }
  }

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Admin kezelő</h2>
          <p>Ez a rész csak <strong>adminisztrator</strong> szerepkörrel jelenik meg.</p>
        </div>
        <button type="button" onClick={loadRows}>Frissítés</button>
      </section>

      <div className="resource-tabs">
        {resourceKeys.map((key) => (
          <button key={key} type="button" className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{resources[key].label}</button>
        ))}
      </div>

      <Message message={error} type="error" />
      <Message message={message} type="success" />

      {!config.readOnly && (
        <section className="card">
          <h3>{editingId ? `${config.label} módosítása` : `${config.label} létrehozása`}</h3>
          {config.createOnly && <p className="muted">Ennél a backendnél a frontend csak létrehozást és külön jegyműveleteket használ.</p>}
          <form onSubmit={handleSubmit} className="grid-form">
            {config.fields.map(([key, label, type, required]) => (
              <label key={key}>
                {label}
                {type === 'textarea' ? (
                  <textarea value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={required} />
                ) : (
                  <input
                    type={type}
                    value={form[key] ?? ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required={required}
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
          <span className="muted">Találatok: {filteredRows.length} / {rows.length}</span>
        </div>

        {config.search && (
          <div className="search-bar">
            <label>
              {config.search.label || 'Keresés'}
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
                {!config.createOnly && <button type="button" onClick={() => startEdit(row)}>Szerkesztés</button>}
                {!config.noDelete && <button type="button" className="danger" onClick={() => handleDelete(row)}>Törlés</button>}
                {active === 'tickets' && (
                  <>
                    <button type="button" onClick={() => ticketAction(`/ticket/${row.id}/release`, 'POST', 'Jegy felszabadítva.')}>Felszabadítás</button>
                    <button type="button" className="danger" onClick={() => ticketAction(`/ticket/${row.id}/cancel`, 'DELETE', 'Jegy törölve.')}>Törlés</button>
                  </>
                )}
              </>
            ) : null}
          />
        )}
      </section>
    </main>
  );
}

function App() {
  const [auth, setAuth] = useState(getSavedAuth());
  const [activePage, setActivePage] = useState('home');
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
    setActivePage('home');
  }

  function logout() {
    clearAuth();
    setAuth(null);
    setActivePage('home');
  }

  if (checking) {
    return <main className="login-page"><section className="login-card"><p>Token ellenőrzése...</p></section></main>;
  }

  if (!auth) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <>
      <Header auth={auth} activePage={activePage} setActivePage={setActivePage} onLogout={logout} />
      {activePage === 'admin' && isAdmin(auth) ? <AdminPanel auth={auth} /> : <HomePage auth={auth} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
