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
      ['name', 'Terem neve', 'text'],
      ['capacity', 'Férőhely', 'number'],
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
      ['time', 'Idő', 'number'],
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

function Message({ message, type = 'info' }) {
  if (!message) return null;
  return <div className={`message ${type}`}>{message}</div>;
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
        </div>

        <Message message={error} type="error" />
        <Message message={success} type="success" />

        {mode === 'login' ? (
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
  const role = getRole(auth);
  const admin = isAdmin(auth);

  return (
    <header className="app-header">
      <div>
        <h1>JegyMester Frontend</h1>
        <p>{auth.user?.name} · <strong>{role || 'nincs szerepkör'}</strong></p>
      </div>
      <nav>
        <button className={activePage === 'home' ? 'active' : ''} onClick={() => setActivePage('home')}>Kezdőlap</button>
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
            <tr key={row.id}>
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

function HomePage({ auth }) {
  const [data, setData] = useState({ movies: [], halls: [], screenings: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadHomeData() {
    setError('');
    setLoading(true);
    try {
      const [movies, halls, screenings] = await Promise.all([
        apiRequest('/movie/', {}, auth.token),
        apiRequest('/hall/', {}, auth.token),
        apiRequest('/screening/', {}, auth.token),
      ]);
      setData({ movies, halls, screenings });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHomeData();
  }, [auth.token]);

  return (
    <main className="content">
      <section className="hero">
        <div>
          <h2>Kezdőlap</h2>
          <p>Ez az oldal minden bejelentkezett felhasználónak látható. Az admin funkciók külön menüben vannak.</p>
        </div>
        <button onClick={loadHomeData}>Frissítés</button>
      </section>
      <Message message={error} type="error" />
      {loading ? <p>Adatok betöltése...</p> : (
        <>
          <ResourceBlock title="Filmek" config={resources.movies} rows={data.movies} />
          <ResourceBlock title="Termek" config={resources.halls} rows={data.halls} />
          <ResourceBlock title="Vetítések" config={resources.screenings} rows={data.screenings} />
        </>
      )}
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

  const config = resources[active];
  const filteredRows = useMemo(
    () => filterRows(rows, searchText, config.search?.fields),
    [rows, searchText, config.search]
  );

  async function loadRows() {
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
          <p>Ez a rész csak <strong>adminisztrator</strong> szerepkörrel jelenik meg.</p>
        </div>
        <button onClick={loadRows}>Frissítés</button>
      </section>

      <div className="resource-tabs">
        {resourceKeys.map((key) => (
          <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{resources[key].label}</button>
        ))}
      </div>

      <Message message={error} type="error" />
      <Message message={message} type="success" />

      {!config.readOnly && (
        <section className="card">
          <h3>{editingId ? `${config.label} módosítása` : `${config.label} létrehozása`}</h3>
          {config.createOnly && <p className="muted">Ennél a backendnél csak létrehozás van, általános PUT/DELETE nincs.</p>}
          <form onSubmit={handleSubmit} className="grid-form">
            {config.fields.map(([key, label, type]) => (
              <label key={key}>
                {label}
                {type === 'textarea' ? (
                  <textarea value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                ) : (
                  <input type={type} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key !== 'user_id' && key !== 'description'} />
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

  function logout() {
    clearAuth();
    setAuth(null);
    setActivePage('home');
  }

  if (checking) {
    return <main className="login-page"><section className="login-card"><p>Token ellenőrzése...</p></section></main>;
  }

  if (!auth) {
    return <LoginPage onLogin={setAuth} />;
  }

  return (
    <>
      <Header auth={auth} activePage={activePage} setActivePage={setActivePage} onLogout={logout} />
      {activePage === 'admin' && isAdmin(auth) ? <AdminPanel auth={auth} /> : <HomePage auth={auth} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
