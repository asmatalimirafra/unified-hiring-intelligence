// src/components/HrNavbar.js
import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import './HrNavbar.css';

function HrNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);

  const handleLogout = async () => {
    setIsLoading(true);
    // Add a small delay for smooth transition
    await new Promise(resolve => setTimeout(resolve, 300));
    localStorage.removeItem('user');
    navigate('/');
  };

  // Improved dropdown handling with delays for better UX
  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowDropdown(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setShowDropdown(false);
    }, 150); // Small delay before hiding
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Check if current path is a candidate route
  const isCandidatePage = location.pathname.includes('/hr/candidates');

  return (
    <nav className="hr-navbar">
      <div className="navbar-brand">
        <div className="navbar-logo" onClick={() => navigate('/hr/dashboard')}>
          <span className="logo-bold">Mirafra</span>
          <span className="logo-highlight">Technologies</span>
        </div>
      </div>

      <div className="navbar-links">
        <NavLink to="/hr/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}>
          <span className="link-text">Dashboard</span>
        </NavLink>

        <NavLink to="/hr/roles" className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}>
          <span className="link-text">Roles</span>
        </NavLink>

        {/* Enhanced Candidates dropdown */}
        <div
          className={`dropdown-wrapper ${isCandidatePage ? 'active' : ''} ${showDropdown ? 'open' : ''}`}
          ref={dropdownRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button 
            className="dropdown-trigger"
            aria-haspopup="true"
            aria-expanded={showDropdown}
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <span className="dropdown-text">Candidates</span>
            <svg 
              className="dropdown-icon" 
              width="12" 
              height="12" 
              viewBox="0 0 12 12" 
              fill="none"
            >
              <path 
                d="M3 4.5L6 7.5L9 4.5" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className={`dropdown-menu ${showDropdown ? 'show' : ''}`}>
            <div className="dropdown-arrow"></div>
            <NavLink 
              to="/hr/candidates" 
              className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}
              onClick={() => setShowDropdown(false)}
            >
              <svg className="dropdown-item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 8C10.2091 8 12 6.20914 12 4C12 1.79086 10.2091 0 8 0C5.79086 0 4 1.79086 4 4C4 6.20914 5.79086 8 8 8Z" fill="currentColor"/>
                <path d="M0 14C0 11.7909 1.79086 10 4 10H12C14.2091 10 16 11.7909 16 14V16H0V14Z" fill="currentColor"/>
              </svg>
              <span>View Candidates</span>
            </NavLink>
            
            <NavLink 
              to="/hr/candidates/add" 
              className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}
              onClick={() => setShowDropdown(false)}
            >
              <svg className="dropdown-item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 0C8.55228 0 9 0.447715 9 1V7H15C15.5523 7 16 7.44772 16 8C16 8.55228 15.5523 9 15 9H9V15C9 15.5523 8.55228 16 8 16C7.44772 16 7 15.5523 7 15V9H1C0.447715 9 0 8.55228 0 8C0 7.44772 0.447715 7 1 7H7V1C7 0.447715 7.44772 0 8 0Z" fill="currentColor"/>
              </svg>
              <span>Add Candidate</span>
            </NavLink>

           

          </div>
        </div>
         <NavLink 
              to="/hr/chat" 
              className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}
            >
              <span className="link-text" style={{ color: '#6c5ce7', fontWeight: 'bold' }}>
              ✨ AI Assistant
               </span>
            </NavLink>

        <NavLink to="/hr/feedback" className={({ isActive }) => `nav-link ${isActive ? 'active-link' : ''}`}>
          <span className="link-text">Feedback</span>
        </NavLink>

        <button 
          onClick={handleLogout} 
          className={`logout-button ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <svg className="loading-spinner" width="16" height="16" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="37.7" strokeDashoffset="37.7">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    values="0 8 8;360 8 8"
                    dur="1s"
                    repeatCount="indefinite"
                  />
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