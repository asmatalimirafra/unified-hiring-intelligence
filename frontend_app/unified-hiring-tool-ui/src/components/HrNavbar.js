// src/components/HrNavbar.js
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './HrNavbar.css';

function HrNavbar() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <nav className="hr-navbar">
      <div className="navbar-brand">
        <div className="navbar-logo" onClick={() => navigate('/hr/dashboard')}>
          <span className="logo-bold">Mirafra</span>
          <span className="logo-highlight">Technologies</span>
        </div>
      </div>

      <div className="navbar-links">
        <NavLink
          to="/hr/dashboard"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text">Dashboard</span>
        </NavLink>

        <NavLink
          to="/hr/roles"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text">Roles</span>
        </NavLink>

        <NavLink
          to="/hr/candidates"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text">View Candidates</span>
        </NavLink>

        <NavLink
          to="/hr/candidates/add"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text">Add Candidate</span>
        </NavLink>

        <NavLink
          to="/hr/schedule"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text">Schedule</span>
        </NavLink>

        <NavLink
          to="/hr/chat"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text" style={{ color: '#6c5ce7', fontWeight: 'bold' }}>
            ✨ AI Assistant
          </span>
        </NavLink>

        <NavLink
          to="/hr/feedback"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text">Feedback</span>
        </NavLink>

        <NavLink
          to="/hr/talent-pool"
          className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
        >
          <span className="link-text" style={{ color: '#0ea5e9', fontWeight: 'bold' }}>
            🎯 Talent Pool
          </span>
        </NavLink>

        <button
          onClick={handleLogout}
          className={`logout-button ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <svg className="loading-spinner" width="16" height="16" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none"
                  strokeLinecap="round" strokeDasharray="37.7" strokeDashoffset="37.7">
                  <animateTransform attributeName="transform" type="rotate"
                    values="0 8 8;360 8 8" dur="1s" repeatCount="indefinite" />
                </circle>
              </svg>
              <span>Signing out...</span>
            </>
          ) : (
            <span>Logout</span>
          )}
        </button>
      </div>
    </nav>
  );
}

export default HrNavbar;