import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../services/api';

function AdminDashboard() {
  const [autoFitment, setAutoFitment] = useState(false);
  const [llmModel, setLlmModel] = useState('llama3.1:8b');
  const [loading, setLoading] = useState(true);

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
      alert('Settings saved successfully!');
    } catch (error) {
      console.error("Error saving admin settings:", error);
      alert('Failed to save settings.');
    }
  };

  if (loading) return <div>Loading settings...</div>;

  return (
    <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
      <h3>System Controls</h3>
      
      <div style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={autoFitment} 
            onChange={(e) => setAutoFitment(e.target.checked)} 
            style={{ width: '20px', height: '20px', marginRight: '10px' }}
          />
          Enable Automatic Fitment Score Calculation (Background GPU execution)
        </label>
        <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem', marginLeft: '30px' }}>
          If ON, candidate resumes will be processed by the LLM immediately upon upload. If OFF, processing only occurs when "View Fitment" is clicked.
        </p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Active LLM Model</label>
        <select 
          value={llmModel} 
          onChange={(e) => setLlmModel(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="llama3.1:8b">Llama 3.1 (8B)</option>
          <option value="mistral">Mistral</option>
          <option value="qwen2:7b">Qwen2 (7B)</option>
          {/* Add more local models here as you pull them into Ollama */}
        </select>
      </div>

      <button 
        onClick={handleSave} 
        style={{ background: '#007bff', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', fontSize: '1rem', borderRadius: '4px', cursor: 'pointer' }}
      >
        Save Configuration
      </button>
    </div>
  );
}

export default AdminDashboard;