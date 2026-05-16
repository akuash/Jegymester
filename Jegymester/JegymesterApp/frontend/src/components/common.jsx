import React, { useState } from 'react';
import { getRole, isAdmin } from '../api';
import {
  getDisplayUser,
  getMovieImageUrl,
  getMovieInitials,
  getValue,
  isCashierOnly,
  isMovieImageField,
  isRegularUser,
} from '../utils/jegymesterHelpers';

export function Message({ message, type = 'info' }) {
  if (!message) return null;
  return <div className={`message ${type}`}>{message}</div>;
}

export function MoviePoster({ movie, size = 'card' }) {
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

export function Header({ auth, activePage, setActivePage, onLogout }) {
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

export function DataTable({ columns, rows, actions }) {
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

export function SeatGrid({ seats, selectedSeats = [], takenSeats = [], vipSeats = [], closedSeats = [], onToggleSeat, readonly = false }) {
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
