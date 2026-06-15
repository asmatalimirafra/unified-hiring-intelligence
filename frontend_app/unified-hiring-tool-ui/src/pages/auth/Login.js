import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Login.css';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../../services/api';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false); // Toggle state for Admin Login
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem('user'); // Force logout on visiting login
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
          // BYPASS THE NGROK WARNING PAGE
          'ngrok-skip-browser-warning': '69420',
        },
      });

      console.log('✅ Login Response:', res.data);

      // Save the WHOLE res.data object to include all user details
      localStorage.setItem('user', JSON.stringify(res.data));

      const { role, user_id } = res.data;

      // Redirect based on role
      if (role === 'HR') {
        navigate('/hr/dashboard');
      } else if (role === 'Interviewer') {
        navigate(`/interviewer/${user_id}/dashboard`);
      } else if (role === 'Admin') {
        navigate('/admin/dashboard'); // Admin routing
      } else {
        alert('Unknown role');
      }
    } catch (err) {
      console.error('❌ Login Error:', err);
      alert('Invalid credentials');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-title">
          {isAdminMode ? (
            <>System <span>Admin</span></>
          ) : (
            <>Mirafra<span>Technologies</span></>
          )}
        </div>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            className="form-control"
            placeholder={isAdminMode ? "Admin Email" : "Username"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="form-control"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button 
            type="submit" 
            className="btn" 
            style={isAdminMode ? { backgroundColor: '#d32f2f' } : {}}
          >
            {isAdminMode ? "Sign In as Admin" : "Sign In"}
          </button>
        </form>
        <div className="login-footer">
          <button 
            type="button" 
            className="btn-text-only" 
            onClick={() => setIsAdminMode(!isAdminMode)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#007bff', 
              cursor: 'pointer', 
              textDecoration: 'underline',
              fontSize: '14px',
              marginTop: '10px'
            }}
          >
            {isAdminMode ? "Switch to User Sign-In" : "ADMIN SIGN-IN PAGE"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;