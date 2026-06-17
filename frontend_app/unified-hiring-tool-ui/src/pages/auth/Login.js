import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Login.css';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../../services/api';

// ── Toast Component ──
function Toast({ toasts }) {
  return (
    <div className="login-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`login-toast login-toast--${t.type}`}>
          <span className="login-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="login-toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const navigate = useNavigate();

  const [toasts, setToasts] = useState([]);

  // Keeps only one toast on screen at a time
  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts([{ id, msg, type }]); 
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  useEffect(() => {
    localStorage.removeItem('user');
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);

      const res = await axios.post(`${BASE_URL}/login/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'ngrok-skip-browser-warning': '69420',
        },
      });

      const { role, user_id } = res.data;

      // ── STRICT MODE VALIDATION ──
      if (isAdminMode && role !== 'Admin') {
        showToast('Access denied: Please use the User Sign-In page.', 'error');
        return; 
      }

      if (!isAdminMode && role === 'Admin') {
        showToast('Access denied: Please use the Admin Sign-In page.', 'error');
        return; 
      }

      localStorage.setItem('user', JSON.stringify(res.data));

      if (role === 'HR') {
        navigate('/hr/dashboard');
      } else if (role === 'Interviewer') {
        navigate(`/interviewer/${user_id}/dashboard`);
      } else if (role === 'Admin') {
        navigate('/admin/dashboard'); 
      } else {
        showToast('Unknown role', 'error');
      }
    } catch (err) {
      showToast('Invalid credentials', 'error');
    }
  };

  return (
    <>
      <Toast toasts={toasts} />
      <div className="login-page-wrapper">
        
        {/* LEFT PANEL - Dynamic based on role */}
        <div className={`login-left-panel ${isAdminMode ? 'admin-theme' : 'user-theme'}`}>
          <div className="brand-content">
            <h1>Unified Hiring <br/>Intelligence</h1>
            <p>
              {isAdminMode 
                ? "System administration, configuration, and LLM orchestration." 
                : "Streamline your recruitment process with AI-driven insights and skill-gap analysis."}
            </p>
          </div>
        </div>

        {/* RIGHT PANEL - The Form */}
        <div className="login-right-panel">
          <div className="login-box-modern">
            <div className="login-title-modern">
              {isAdminMode ? (
                <>System <span>Admin</span></>
              ) : (
                <>Mirafra <span>Technologies</span></>
              )}
            </div>
            
            <p className="login-subtitle">
              {isAdminMode ? "Sign in to manage system controls" : "Welcome back! Please enter your details."}
            </p>

            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="form-control-modern"
                  placeholder={isAdminMode ? "admin@company.com" : "name@company.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div className="input-group">
                <label>Password</label>
                <input
                  type="password"
                  className="form-control-modern"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button 
                type="submit" 
                className={`btn-modern ${isAdminMode ? 'btn-admin' : 'btn-user'}`}
              >
                {isAdminMode ? "Authenticate as Admin" : "Sign In"}
              </button>
            </form>

            <div className="login-footer-modern">
              <span className="footer-text">
                {isAdminMode ? "Not an administrator?" : "System administrator?"}
              </span>
              <button 
                type="button" 
                className="btn-text-only" 
                onClick={() => {
                  setIsAdminMode(!isAdminMode);
                  setEmail('');
                  setPassword('');
                }}
              >
                {isAdminMode ? "Switch to User Portal" : "Admin Sign-In"}
              </button>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

export default Login;