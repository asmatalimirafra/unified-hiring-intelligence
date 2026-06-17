// src/pages/admin/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../services/api';
import './AdminDashboard.css';

// ── Toast Component ──
function Toast({ toasts }) {
  return (
    <div className="admin-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`admin-toast admin-toast--${t.type}`}>
          <span className="admin-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="admin-toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function AdminDashboard() {
  const [autoFitment, setAutoFitment] = useState(false);
  const [llmModel, setLlmModel] = useState('llama3.1:8b');
  const [loading, setLoading] = useState(true);

  // Toast State
  const [toasts, setToasts] = useState([]);

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/admin/settings/`, {
        headers: { 'ngrok-skip-browser-warning': '69420' }
      });
      setAutoFitment(res.data.auto_fitment_enabled || false);
      setLlmModel(res.data.active_llm || 'llama3.1:8b');
      setLoading(false);
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      setLoading(false);
      showToast('Failed to load settings.', 'error');
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${BASE_URL}/admin/settings/`, {
        auto_fitment_enabled: autoFitment,
        active_llm: llmModel
      }, {
        headers: { 'ngrok-skip-browser-warning': '69420' }
      });
      
      // Trigger success toast instead of alert
      showToast('Settings saved successfully!', 'success');
      
    } catch (error) {
      console.error("Error saving admin settings:", error);
      
      // Trigger error toast instead of alert
      showToast('Failed to save settings.', 'error');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '2rem' }}>Loading settings...</div>;

  return (
    <>
      <Toast toasts={toasts} />
      
      <div className="admin-card">
        <h3>System Controls</h3>
        
        <div className="admin-control-group">
          <label className="admin-toggle-label">
            <input 
              type="checkbox" 
              className="admin-toggle-checkbox"
              checked={autoFitment} 
              onChange={(e) => setAutoFitment(e.target.checked)} 
            />
            Enable Automatic Fitment Score Calculation (Background GPU execution)
          </label>
          <p className="admin-help-text">
            If ON, candidate resumes will be processed by the LLM immediately upon upload. If OFF, processing only occurs when "View Fitment" is clicked.
          </p>
        </div>

        <div className="admin-control-group">
          <label className="admin-select-label">Active LLM Model</label>
          <select 
            className="admin-select"
            value={llmModel} 
            onChange={(e) => setLlmModel(e.target.value)}
          >
            <option value="llama3.1:8b">Llama 3.1 (8B)</option>
            <option value="mistral">Mistral</option>
            <option value="qwen2:7b">Qwen2 (7B)</option>
          </select>
        </div>

        <button className="admin-save-btn" onClick={handleSave}>
          Save Configuration
        </button>
      </div>
    </>
  );
}

export default AdminDashboard;