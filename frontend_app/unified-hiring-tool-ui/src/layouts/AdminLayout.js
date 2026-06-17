// src/layouts/AdminLayout.js
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import '../pages/admin/AdminDashboard.css'; // Import CSS

function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="admin-layout-container">
      <header className="admin-header">
        <h2>Admin Console: Mirafra Technologies</h2>
        <button className="admin-logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>
      <main className="admin-main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;