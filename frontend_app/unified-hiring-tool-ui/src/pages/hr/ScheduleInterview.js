// src/pages/hr/ScheduleInterview.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ScheduleInterview.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

export default function ScheduleInterview() {
  // ── Logged-in HR ─────────────────────────────────────────────────────────
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId   = storedUser.user_id || null;
  const hrName = storedUser.name    || 'HR';

  // ── Data ─────────────────────────────────────────────────────────────────
  const [roles,      setRoles]      = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [scheduled,  setScheduled]  = useState([]); // already-scheduled by this HR

  // ── Filter state ─────────────────────────────────────────────────────────
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // ── Modal state ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState({ open: false, candidate: null });
  const [form,  setForm]  = useState({
    interviewer_email: '',
    scheduled_datetime: '',
    meeting_link: '',
  });
  const [submitting,  setSubmitting]  = useState(false);
  const [statusMsg,   setStatusMsg]   = useState('');
  const [statusType,  setStatusType]  = useState('');

  // ── Load roles & candidates on mount ─────────────────────────────────────
  useEffect(() => {
    fetchRoles();
    fetchCandidates();
  }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-roles/`, { ...axiosConfig, params });
      setRoles(Array.isArray(res.data) ? res.data.filter(r => r.status === 'open') : []);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const fetchCandidates = async () => {
    try {
      // Only this HR's candidates
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
      const all = Array.isArray(res.data) ? res.data : [];
      // Split into unscheduled and scheduled
      setCandidates(all.filter(c => c.status !== 'Scheduled'));
      setScheduled(all.filter(c => c.status === 'Scheduled'));
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    }
  };

  // ── Filtered by selected role ─────────────────────────────────────────────
  const filteredUnscheduled = selectedRoleId
    ? candidates.filter(c => String(c.applied_role_id) === String(selectedRoleId))
    : candidates;

  const filteredScheduled = selectedRoleId
    ? scheduled.filter(c => String(c.applied_role_id) === String(selectedRoleId))
    : scheduled;

  // ── Open modal ────────────────────────────────────────────────────────────
  const openModal = (candidate) => {
    setModal({ open: true, candidate });
    setForm({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });
    setStatusMsg('');
    setStatusType('');
  };

  // ── Submit schedule ───────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!form.interviewer_email.trim()) {
      setStatusMsg('Please enter the interviewer email.');
      setStatusType('error');
      return;
    }
    if (!form.scheduled_datetime) {
      setStatusMsg('Please select a date and time.');
      setStatusType('error');
      return;
    }

    setSubmitting(true);
    setStatusMsg('Scheduling...');
    setStatusType('info');

    try {
      await axios.post(
        `${BASE_URL}/schedule-interview/`,
        {
          candidate_id:        modal.candidate.candidate_id,
          interviewer_email:   form.interviewer_email.trim(),
          scheduled_datetime:  form.scheduled_datetime,
          meeting_link:        form.meeting_link.trim(),
          hr_id:               hrId,
          hr_name:             hrName,
        },
        axiosConfig
      );

      setStatusMsg('✅ Interview scheduled successfully!');
      setStatusType('success');

      setTimeout(() => {
        setModal({ open: false, candidate: null });
        fetchCandidates(); // refresh both lists
      }, 1200);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to schedule. Please check the interviewer email.';
      setStatusMsg(`❌ ${msg}`);
      setStatusType('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Unschedule (move back to unscheduled) ────────────────────────────────
  const handleUnschedule = async (candidate) => {
    if (!window.confirm(`Remove schedule for "${candidate.name}"?`)) return;
    try {
      await axios.post(
        `${BASE_URL}/unschedule-interview/`,
        { candidate_id: candidate.candidate_id },
        axiosConfig
      );
      fetchCandidates();
    } catch (err) {
      alert('Failed to unschedule. Please try again.');
    }
  };

  const formatDateTime = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="schedule-page">
      <div className="schedule-header">
        <h2>Schedule Interviews</h2>
        <p className="schedule-sub">Assign candidates to interviewers for their review</p>
      </div>

      {/* ── Role filter ──────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <label>Filter by Role:</label>
        <select
          className="role-select"
          value={selectedRoleId}
          onChange={e => setSelectedRoleId(e.target.value)}
        >
          <option value="">— All Roles —</option>
          {roles.map(r => (
            <option key={r.role_id} value={r.role_id}>
              {r.role} ({r.role_id})
            </option>
          ))}
        </select>
      </div>

      {/* ── Unscheduled candidates ───────────────────────────────────────── */}
      <section className="section-card">
        <div className="section-header">
          <span className="section-icon">📋</span>
          <h3>Unscheduled Candidates</h3>
          <span className="count-badge">{filteredUnscheduled.length}</span>
        </div>

        {filteredUnscheduled.length === 0 ? (
          <p className="empty-msg">No unscheduled candidates{selectedRoleId ? ' for this role' : ''}.</p>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Candidate ID</th>
                <th>Name</th>
                <th>Applied Role</th>
                <th>Resume</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnscheduled.map(c => (
                <tr key={c.candidate_id}>
                  <td>{c.candidate_id}</td>
                  <td>{c.name}</td>
                  <td>{c.applied_role}</td>
                  <td>
                    <a
                      href={`${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`}
                      target="_blank" rel="noopener noreferrer"
                      className="resume-link"
                    >
                      View PDF
                    </a>
                  </td>
                  <td>
                    <button className="btn-schedule" onClick={() => openModal(c)}>
                      📅 Schedule
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Already scheduled ────────────────────────────────────────────── */}
      <section className="section-card" style={{ marginTop: '2rem' }}>
        <div className="section-header">
          <span className="section-icon">✅</span>
          <h3>Scheduled Interviews</h3>
          <span className="count-badge">{filteredScheduled.length}</span>
        </div>

        {filteredScheduled.length === 0 ? (
          <p className="empty-msg">No scheduled interviews yet{selectedRoleId ? ' for this role' : ''}.</p>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Candidate ID</th>
                <th>Name</th>
                <th>Applied Role</th>
                <th>Interviewer Email</th>
                <th>Date & Time</th>
                <th>Meeting Link</th>
                <th>Unschedule</th>
              </tr>
            </thead>
            <tbody>
              {filteredScheduled.map(c => (
                <tr key={c.candidate_id}>
                  <td>{c.candidate_id}</td>
                  <td>{c.name}</td>
                  <td>{c.applied_role}</td>
                  <td>{c.interview_details?.interviewer_email || '—'}</td>
                  <td>{formatDateTime(c.interview_details?.scheduled_datetime)}</td>
                  <td>
                    {c.interview_details?.meeting_link ? (
                      <a href={c.interview_details.meeting_link} target="_blank" rel="noopener noreferrer" className="meeting-link">
                        Join Link 🔗
                      </a>
                    ) : '—'}
                  </td>
                  <td>
                    <button className="btn-unschedule" onClick={() => handleUnschedule(c)}>
                      ✕ Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Schedule Modal ───────────────────────────────────────────────── */}
      {modal.open && modal.candidate && (
        <div className="modal-backdrop" onClick={() => setModal({ open: false, candidate: null })}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>

            <div className="modal-header">
              <div>
                <h3>Schedule Interview</h3>
                <p className="modal-sub">
                  <strong>{modal.candidate.name}</strong> &nbsp;·&nbsp; {modal.candidate.applied_role}
                </p>
              </div>
              <button className="modal-close" onClick={() => setModal({ open: false, candidate: null })}>✕</button>
            </div>

            <div className="modal-body">

              <div className="field-group">
                <label>Interviewer Email *</label>
                <input
                  type="email"
                  placeholder="interviewer@company.com"
                  value={form.interviewer_email}
                  onChange={e => setForm({ ...form, interviewer_email: e.target.value })}
                />
                <small className="field-hint">Must match an existing Interviewer account email</small>
              </div>

              <div className="field-group">
                <label>Date & Time *</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_datetime}
                  onChange={e => setForm({ ...form, scheduled_datetime: e.target.value })}
                />
              </div>

              <div className="field-group">
                <label>Meeting Link</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  value={form.meeting_link}
                  onChange={e => setForm({ ...form, meeting_link: e.target.value })}
                />
              </div>

              {statusMsg && (
                <div className={`status-banner ${statusType}`}>{statusMsg}</div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => setModal({ open: false, candidate: null })}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-confirm"
                onClick={handleSchedule}
                disabled={submitting}
              >
                {submitting ? 'Scheduling...' : '📅 Confirm Schedule'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}