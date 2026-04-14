import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Login.css';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem('user'); // Force logout on visiting login
  }, []);

  // const handleLogin = async (e) => {
  //   e.preventDefault();
  //   try {
  //     const formData = new FormData();
  //     formData.append('email', email);
  //     formData.append('password', password);

  //     const res = await axios.post('http://localhost:8080/login/', formData, {
  //       headers: {
  //         'Content-Type': 'multipart/form-data',
  //       },
  //     });

  //     console.log('✅ Login Response:', res);

  //     alert(`Login succeeded. Got role: ${res.data?.role}`);

  //     const { role, user_id, name } = res.data;

  //     // Save login status
  //     localStorage.setItem('user', JSON.stringify({ role, user_id, name }));

  //     // Redirect based on role
  //     if (role === 'HR') {
  //       navigate('/hr/dashboard');
  //     } else if (role === 'Interviewer') {
  //       navigate(`/interviewer/${user_id}/dashboard`);
  //     } else {
  //       alert('Unknown role');
  //     }
  //   } catch (err) {
  //     console.error('❌ Login Error:', err);
  //     alert('Invalid credentials');
  //   }
  // };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);

      // const res = await axios.post('http://localhost:8080/login/', formData, {
      //   headers: {
      //     'Content-Type': 'multipart/form-data',
      //   },
      // });
      const res = await axios.post('https://unwithering-unattentively-herbert.ngrok-free.dev/login/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          // 2. ADD THIS HEADER TO BYPASS THE NGROK WARNING PAGE
          'ngrok-skip-browser-warning': '69420',
        },
      });

      console.log('✅ Login Response:', res.data);

      // 1. Save the WHOLE res.data object to include interviews_taken
      localStorage.setItem('user', JSON.stringify(res.data));

      const { role, user_id } = res.data;

      // 2. Redirect based on role
      if (role === 'HR') {
        navigate('/hr/dashboard');
      } else if (role === 'Interviewer') {
        navigate(`/interviewer/${user_id}/dashboard`);
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
          Mirafra<span>Technologies</span>
        </div>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            className="form-control"
            placeholder="Username"
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
          <button type="submit" className="btn">
            Sign In
          </button>
        </form>
        <div className="login-footer">
          <a href="/admin-login">ADMIN SIGN-IN PAGE</a>
        </div>
      </div>
    </div>
  );
}

export default Login;
