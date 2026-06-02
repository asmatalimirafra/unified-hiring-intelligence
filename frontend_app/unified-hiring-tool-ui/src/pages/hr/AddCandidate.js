// src/pages/hr/AddCandidate.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './AddCandidate.css';
import { FaCheckCircle } from 'react-icons/fa';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

// ── Toast Component ───────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="ac-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`ac-toast ac-toast--${t.type}`}>
          <span className="ac-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="ac-toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({ config, onConfirm, onCancel }) {
  if (!config) return null;
  return (
    <div className="ac-confirm-overlay" onClick={onCancel}>
      <div className="ac-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="ac-confirm-icon">{config.icon || '❓'}</div>
        <h4 className="ac-confirm-title">{config.title}</h4>
        <p className="ac-confirm-msg">{config.message}</p>
        <div className="ac-confirm-actions">
          <button className="ac-confirm-btn ac-confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`ac-confirm-btn ac-confirm-btn--ok ac-confirm-btn--${config.variant || 'danger'}`}
            onClick={onConfirm}
          >
            {config.confirmLabel || 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AddCandidate() {
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles]         = useState([]);
  const [formData, setFormData]   = useState({
    name: '', applied_role: '', email: '',
    phone: '', github: '', location: '', resume_file: null,
  });
  const [candidateId, setCandidateId] = useState('');
  const [atsScore, setAtsScore]       = useState(null);
  const [addedOn, setAddedOn]         = useState('');
  const [loading, setLoading]         = useState(false);
  const [statusMsg, setStatusMsg]     = useState('');
  const [statusType, setStatusType]   = useState('');
  const [step, setStep]               = useState(1);

  // AbortController ref — lets us cancel the in-flight upload request
  const abortControllerRef = useRef(null);

  // ── Toast state ──────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Confirm dialog state ─────────────────────────────────────────────────────
  const [confirmConfig, setConfirmConfig]     = useState(null);
  const [confirmCallback, setConfirmCallback] = useState(null);

  const askConfirm = (config) =>
    new Promise((resolve) => {
      setConfirmConfig(config);
      setConfirmCallback(() => resolve);
    });

  const handleConfirmYes = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(true);
    setConfirmCallback(null);
  };

  const handleConfirmNo = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(false);
    setConfirmCallback(null);
  };

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const params = hrId ? { hr_id: hrId } : {};
        const res = await axios.get(`${BASE_URL}/get-roles/`, {
          headers: { "ngrok-skip-browser-warning": "true" },
          params
        });
        if (Array.isArray(res.data)) {
          setRoles(res.data.filter((r) => r.status?.toLowerCase().trim() === "open"));
        }
      } catch (err) {
        console.error("❌ Failed to fetch roles", err);
        showToast('Failed to fetch roles. Check your connection.', 'error');
      }
    };
    fetchRoles();
  }, []); // eslint-disable-line

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      const allowedExtensions = ['.pdf', '.docx'];
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        setStatusType('error');
        setStatusMsg('Please upload only PDF or DOCX files.');
        return;
      }
      setStatusMsg('');
      setStatusType('');
    }
    setFormData({ ...formData, resume_file: file });
  };

  // ── Reset helper ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setStep(1);
    setFormData({ name: '', applied_role: '', email: '', phone: '', github: '', location: '', resume_file: null });
    setCandidateId('');
    setAddedOn('');
    setAtsScore(null);
    setStatusMsg('');
    setStatusType('');
  };

  const handleUpload = async () => {
    if (!formData.name.trim())  { setStatusType('error'); setStatusMsg('Please enter candidate name.'); return; }
    if (!formData.applied_role) { setStatusType('error'); setStatusMsg('Please select an applied role.'); return; }
    if (!formData.resume_file)  { setStatusType('error'); setStatusMsg('Please upload a resume file.'); return; }

    abortControllerRef.current = new AbortController();

    setLoading(true);
    setStatusMsg('Extracting details from resume...');
    setStatusType('info');

    try {
      const data = new FormData();
      data.append('name', formData.name.trim());
      data.append('applied_role', formData.applied_role);
      data.append('resume_file', formData.resume_file);
      if (hrId) data.append('hr_id', hrId);

      const res = await axios.post(`${BASE_URL}/add-candidate/`, data, {
        headers: {
          "Content-Type": "multipart/form-data",
          "ngrok-skip-browser-warning": "true"
        },
        signal: abortControllerRef.current.signal
      });

      const added = res.data;
      setCandidateId(added.candidate_id);
      setAtsScore(added.ats_score ?? null);
      setAddedOn(new Date().toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }));

      setStatusMsg('Fetching extracted details...');
      const params = hrId ? { hr_id: hrId } : {};
      const allCandidates = await axios.get(`${BASE_URL}/get-candidates/`, {
        headers: { "ngrok-skip-browser-warning": "true" },
        params
      });
      const newCandidate = allCandidates.data.find((c) => c.candidate_id === added.candidate_id);

      if (newCandidate) {
        setFormData((prev) => ({
          ...prev,
          email:    newCandidate.email    || '',
          phone:    newCandidate.phone    || '',
          github:   newCandidate.github   || '',
          location: newCandidate.location || '',
        }));
        setStatusType('success');
        setStatusMsg('✅ Resume processed successfully! Please review the extracted details.');
      }

      setStep(2);
      showToast(`${formData.name.trim()} added successfully! (${added.candidate_id})`);
    } catch (err) {
      if (axios.isCancel(err) || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        setStatusType('');
        setStatusMsg('');
        setLoading(false);
        return;
      }

      console.error('❌ Upload error:', err);
      let errorMessage = '❌ Upload failed. Please try again.';
      if (err.response) {
        switch (err.response.status) {
          case 400: errorMessage = err.response.data?.detail || '❌ Invalid file format.'; break;
          case 404: errorMessage = '❌ Selected role not found. Please refresh and try again.'; break;
          case 409: errorMessage = '❌ Candidate already exists with this information.'; break;
          case 413: errorMessage = '❌ File too large. Please upload a smaller file.'; break;
          case 500: errorMessage = '❌ Server error. Please try again later.'; break;
          default:  errorMessage = `❌ Upload failed: ${err.response.data?.detail || err.response.statusText}`;
        }
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = '❌ Request timed out. The resume processing took too long — please try again.';
      } else if (err.message?.includes('Network Error')) {
        errorMessage = '❌ Network error. Please check your connection and try again.';
      }
      setStatusType('error');
      setStatusMsg(errorMessage);
      showToast(errorMessage.replace('❌ ', ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel during Step 1 loading (aborts in-flight request) ─────────────────
  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
    setStatusMsg('');
    setStatusType('');
  };

  // ── Cancel in Step 2 — confirm, then delete candidate record + reset ─────────
  const handleCancelStep2 = async () => {
    if (!candidateId) { resetForm(); return; }

    const yes = await askConfirm({
      icon: '🗑️',
      title: `Cancel adding "${formData.name}"?`,
      message: 'The candidate record will be permanently removed from the system.',
      confirmLabel: 'Yes, Remove',
      variant: 'danger'
    });
    if (!yes) return;

    setLoading(true);
    setStatusMsg('Cancelling — removing candidate...');
    setStatusType('info');
    try {
      await axios.delete(`${BASE_URL}/delete-candidate/${candidateId}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      showToast('Candidate removed. Form has been reset.');
    } catch (err) {
      console.error('Cancel delete failed:', err);
      showToast('Could not remove candidate record — please delete manually.', 'error');
    } finally {
      setLoading(false);
      resetForm();
    }
  };

  // ── Save & Exit ───────────────────────────────────────────────────────────────
  const handleSaveAndExit = async () => {
    const yes = await askConfirm({
      icon: '✅',
      title: 'Save and exit?',
      message: `"${formData.name}" has been added to the system. Click confirm to finish and reload the page.`,
      confirmLabel: 'Yes, Save & Exit',
      variant: 'success'
    });
    if (yes) window.location.reload();
  };

  // ── Reset Form ────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    const yes = await askConfirm({
      icon: '🔄',
      title: 'Reset the form?',
      message: 'All entered information will be cleared. Are you sure?',
      confirmLabel: 'Yes, Reset',
      variant: 'warning'
    });
    if (yes) {
      resetForm();
      showToast('Form has been reset.');
    }
  };

  return (
    <div className="add-candidate-container">

      {/* ── Toast notifications (top-right) ──────────────────────────────── */}
      <Toast toasts={toasts} />

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      <ConfirmDialog
        config={confirmConfig}
        onConfirm={handleConfirmYes}
        onCancel={handleConfirmNo}
      />

      <h2>Add New Candidate</h2>

      {step === 1 && (
        <div className="upload-form">
          <div className="form-group">
            <label htmlFor="name">Candidate Name *</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter candidate's full name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Applied Role *</label>
            <select
              id="role"
              value={formData.applied_role}
              onChange={(e) => setFormData({ ...formData, applied_role: e.target.value })}
              required
            >
              <option value="">-- Select Role --</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role}>
                  {role.role} ({role.role_id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="resume">Upload Resume * (PDF or DOCX only)</label>
            <input
              id="resume"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              required
            />
            {formData.resume_file && (
              <div className="file-info">
                <small>
                  Selected: {formData.resume_file.name} ({(formData.resume_file.size / 1024 / 1024).toFixed(2)} MB)
                </small>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-upload" disabled={loading} onClick={handleUpload}>
              {loading ? 'Processing Resume...' : 'Upload & Process Resume'}
            </button>
            <button type="button" className="btn-reset" onClick={handleReset} disabled={loading}>
              Reset Form
            </button>
          </div>

          {/* ── Processing overlay with Cancel button ── */}
          {loading && (
            <div className="processing-overlay">
              <div className="processing-box">
                <div className="processing-spinner" />
                <p className="processing-text">Processing Resume…</p>
                <p className="processing-sub">Extracting details &amp; calculating ATS score.</p>
                <p className="processing-sub">Usually done in a few seconds.</p>
                <button
                  type="button"
                  className="btn-cancel-upload"
                  onClick={handleCancelUpload}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="review-form">
          <h3>Review &amp; Edit Candidate Details</h3>
          <p className="review-note">
            Please review the extracted information and make any necessary corrections:
          </p>

          {addedOn && (
            <div className="timestamp-badge">🕐 Added on: <strong>{addedOn}</strong></div>
          )}

          {atsScore !== null && (
            <div className={`ats-score-badge ${atsScore >= 30 ? 'ats-pass' : 'ats-fail'}`}>
              📊 ATS Score: <strong>{atsScore.toFixed(1)}%</strong>
              {atsScore < 30
                ? ' — Below 30%: this candidate will not appear in the interview schedule.'
                : ' — Above 30%: eligible for interview scheduling.'}
            </div>
          )}

          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Applied Role *</label>
            <select
              value={formData.applied_role}
              onChange={(e) => setFormData({ ...formData, applied_role: e.target.value })}
              required
            >
              {roles.map((role) => (
                <option key={role.role_id} value={role.role}>
                  {role.role} ({role.role_id})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="candidate@example.com"
            />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>GitHub Profile</label>
            <input
              type="url"
              value={formData.github}
              onChange={(e) => setFormData({ ...formData, github: e.target.value })}
              placeholder="https://github.com/username"
            />
          </div>
          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="City, State, Country"
            />
          </div>

          <div className="action-buttons">
            <button className="btn-exit" onClick={handleSaveAndExit} disabled={loading}>
              <FaCheckCircle /> Save &amp; Exit
            </button>
            <button className="btn-delete" onClick={handleCancelStep2} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={`status-msg ${statusType}`}>{statusMsg}</div>
      )}
    </div>
  );
}
