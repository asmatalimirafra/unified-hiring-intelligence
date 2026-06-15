import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ background: '#333', color: '#fff', padding: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Admin Console</h2>
        <button onClick={handleLogout} style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Logout
        </button>
      </header>
      <main style={{ flex: 1, padding: '2rem', background: '#f4f6f8' }}>
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;