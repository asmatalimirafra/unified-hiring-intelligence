import React from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import './InterviewerNavbar.css';

function InterviewerNavbar() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('user');   // Clear session data
    navigate('/');                     // Redirect to home/login
  };

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <span className="logo-bold">Mirafra</span>
        <span className="logo-highlight">Technologies</span>
      </div>
      <div className="navbar-links">
        <NavLink to={`/interviewer/${userId}/dashboard`} className={({ isActive }) => isActive ? 'active-link' : ''}>
          Dashboard
        </NavLink>
        <NavLink to={`/interviewer/${userId}/fitment`} className={({ isActive }) => isActive ? 'active-link' : ''}>
          Fitment
        </NavLink>
        <NavLink to={`/interviewer/${userId}/compare`} className={({ isActive }) => isActive ? 'active-link' : ''}>
          Compare
        </NavLink>
        <NavLink to={`/interviewer/${userId}/interviews`} className={({ isActive }) => isActive ? 'active-link' : ''}>
          Interview
        </NavLink>
        {/* ✅ NEW: Link to the AI Assistant */}
        <NavLink 
          to={`/interviewer/${userId}/assistant`} 
          className={({ isActive }) => isActive ? 'active-link assistant-tab' : 'assistant-tab'}
        >
          AI Assistant
        </NavLink>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>
    </nav>
  );
}

export default InterviewerNavbar;
