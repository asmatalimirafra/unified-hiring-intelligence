// src/pages/hr/ScheduleInterview.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ScheduleInterview.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Score helpers ──────────────────────────────────────────────────────────────
function getOverallAvg(interviews = []) {
  if (!interviews.length) return null;
  let total = 0, count = 0;
  interviews.forEach(i => {
    const r = i.ratings || {};
    total += (r.communication || 0) + (r.domain_knowledge || 0) + (r.problem_solving || 0);
    count += 3;
  });
  return count > 0 ? total / count : null;
}

function getVerdictLabel(avg) {
  if (avg === null) return null;
  if (avg >= 4)   return { label: 'Strong Hire', cls: 'verdict-strong' };
  if (avg >= 3)   return { label: 'Hire',        cls: 'verdict-hire'   };
  if (avg >= 2.5) return { label: 'Weak Hire',   cls: 'verdict-weak'   };
  return                 { label: 'No Hire',     cls: 'verdict-no'     };
}

function getNextRound(interviews = []) {
  if (!interviews.length) return 1;
  return Math.max(...interviews.map(i => i.round)) + 1;
}

export default function ScheduleInterview() {
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId   = storedUser.user_id || null;
  const hrName = storedUser.name    || 'HR';

  const [roles,         setRoles]         = useState([]);
  const [allCands,      setAllCands]      = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Add-interview modal
  const [modal,      setModal]      = useState({ open: false, candidate: null });
  const [form,       setForm]       = useState({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });

  // Edit-schedule modal
  const [editModal,  setEditModal]  = useState({ open: false, candidate: null });
  const [editForm,   setEditForm]   = useState({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [statusType, setStatusType] = useState('');

  useEffect(() => { fetchRoles(); fetchCandidates(); }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-roles/`, { ...axiosConfig, params });
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error('Failed to fetch roles:', err); }
  };

  const fetchCandidates = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
      setAllCands(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error('Failed to fetch candidates:', err); }
  };

  const getRoleName = (roleId) => {
    const role = roles.find(r => String(r.role_id) === String(roleId));
    return role ? role.role : null;
  };

  const openRoleIds = new Set(
    roles.filter(r => r.status?.toLowerCase().trim() === 'open').map(r => String(r.role_id))
  );
  const openRoles = roles.filter(r => r.status?.toLowerCase().trim() === 'open');

  // ── Section filters ────────────────────────────────────────────────────────
  const applyRoleFilter = (c) =>
    !selectedRoleId || String(c.applied_role_id) === String(selectedRoleId);

  // Pending = open role, not selected, not rejected
  const pending = allCands.filter(c =>
    openRoleIds.has(String(c.applied_role_id)) &&
    !c.candidate_selected &&
    !c.candidate_rejected &&
    applyRoleFilter(c)
  );

  // Scheduled = status "Scheduled", not yet selected/rejected
  const scheduledRows = allCands.filter(c =>
    c.status === 'Scheduled' &&
    !c.candidate_selected &&
    !c.candidate_rejected &&
    applyRoleFilter(c)
  );

  // Selected = HR pressed Check Verdict and avg >= 3
  const selected = allCands.filter(c =>
    c.candidate_selected && applyRoleFilter(c)
  );

  // Rejected = HR pressed Check Verdict and avg < 3
  const rejected = allCands.filter(c =>
    c.candidate_rejected && applyRoleFilter(c)
  );

  // ── Add-interview modal ────────────────────────────────────────────────────
  const openModal = (candidate) => {
    setModal({ open: true, candidate });
    setForm({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });
    setStatusMsg(''); setStatusType('');
  };
  const closeModal = () => {
    setModal({ open: false, candidate: null });
    setStatusMsg(''); setStatusType('');
  };

  // ── Edit-schedule modal ────────────────────────────────────────────────────
  const openEditModal = (candidate) => {
    const d = candidate.interview_details || {};
    let dt = '';
    if (d.scheduled_datetime) {
      try { dt = new Date(d.scheduled_datetime).toISOString().slice(0, 16); } catch {}
    }
    setEditModal({ open: true, candidate });
    setEditForm({
      interviewer_email:  d.interviewer_email || '',
      scheduled_datetime: dt,
      meeting_link:       d.meeting_link      || '',
    });
    setStatusMsg(''); setStatusType('');
  };
  const closeEditModal = () => {
    setEditModal({ open: false, candidate: null });
    setStatusMsg(''); setStatusType('');
  };

  // ── Schedule new round ─────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!form.interviewer_email.trim()) {
      setStatusMsg('Please enter the interviewer email.'); setStatusType('error'); return;
    }
    if (!form.scheduled_datetime) {
      setStatusMsg('Please select a date and time.'); setStatusType('error'); return;
    }
    setSubmitting(true);
    setStatusMsg('Scheduling...'); setStatusType('info');
    try {
      await axios.post(`${BASE_URL}/schedule-interview/`, {
        candidate_id:       modal.candidate.candidate_id,
        interviewer_email:  form.interviewer_email.trim(),
        scheduled_datetime: form.scheduled_datetime,
        meeting_link:       form.meeting_link.trim(),
        hr_id:              hrId,
        hr_name:            hrName,
      }, axiosConfig);
      setStatusMsg('✅ Scheduled!');
      setStatusType('success');
      setTimeout(() => { closeModal(); fetchCandidates(); }, 1200);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed. Check the interviewer email.';
      setStatusMsg(`❌ ${msg}`); setStatusType('error');
    } finally { setSubmitting(false); }
  };

  // ── Edit existing scheduled interview ──────────────────────────────────────
  const handleEditSchedule = async () => {
    if (!editForm.interviewer_email.trim()) {
      setStatusMsg('Please enter the interviewer email.'); setStatusType('error'); return;
    }
    if (!editForm.scheduled_datetime) {
      setStatusMsg('Please select a date and time.'); setStatusType('error'); return;
    }
    setSubmitting(true);
    setStatusMsg('Updating...'); setStatusType('info');
    try {
      await axios.post(`${BASE_URL}/schedule-interview/`, {
        candidate_id:       editModal.candidate.candidate_id,
        interviewer_email:  editForm.interviewer_email.trim(),
        scheduled_datetime: editForm.scheduled_datetime,
        meeting_link:       editForm.meeting_link.trim(),
        hr_id:              hrId,
        hr_name:            hrName,
      }, axiosConfig);
      setStatusMsg('✅ Updated!');
      setStatusType('success');
      setTimeout(() => { closeEditModal(); fetchCandidates(); }, 1200);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed. Check the interviewer email.';
      setStatusMsg(`❌ ${msg}`); setStatusType('error');
    } finally { setSubmitting(false); }
  };

  // ── Cancel scheduled interview → back to unscheduled ──────────────────────
  const handleCancelInterview = async (candidate) => {
    if (!window.confirm(`Cancel the scheduled interview for "${candidate.name}"?\nThey will move back to Pending (unscheduled).`)) return;
    try {
      await axios.post(`${BASE_URL}/unschedule-interview/`, { candidate_id: candidate.candidate_id }, axiosConfig);
      fetchCandidates();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel interview. Please try again.';
      alert(`❌ ${msg}`);
    }
  };

  // ── Check Verdict: avg >= 3 → Selected, else → Rejected ───────────────────
  const handleCheckVerdict = async (candidate) => {
    const avg = getOverallAvg(candidate.interviews || []);
    if (avg === null) { alert('No interview rounds completed yet.'); return; }

    const verdict    = getVerdictLabel(avg);
    const isSelected = avg >= 3;
    const confirmMsg = isSelected
      ? `Avg score: ${avg.toFixed(2)}/5 — ${verdict.label}\n\nMove "${candidate.name}" to Selected?`
      : `Avg score: ${avg.toFixed(2)}/5 — ${verdict.label}\n\nScore is below 3. Move "${candidate.name}" to Rejected?`;

    if (!window.confirm(confirmMsg)) return;
    try {
      if (isSelected) {
        await axios.post(`${BASE_URL}/select-candidate/${candidate.candidate_id}`, {}, axiosConfig);
      } else {
        await axios.post(`${BASE_URL}/reject-candidate/${candidate.candidate_id}`, {}, axiosConfig);
      }
      fetchCandidates();
    } catch {
      alert('Failed to update candidate status. Please try again.');
    }
  };

  // ── Undo Selected / Rejected → back to Pending ────────────────────────────
  const handleUndo = async (candidate, from) => {
    const label = from === 'selected' ? 'Selected' : 'Rejected';
    if (!window.confirm(`Move "${candidate.name}" back to Pending from ${label}?`)) return;
    try {
      await axios.post(`${BASE_URL}/undo-candidate-verdict/${candidate.candidate_id}`, {}, axiosConfig);
      fetchCandidates();
    } catch {
      alert('Failed to undo. Please try again.');
    }
  };

  const formatDateTime = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="schedule-page">

      <div className="schedule-header">
        <h2>Schedule Interviews</h2>
        <p className="schedule-sub">Manage interview rounds and candidate pipeline</p>
      </div>

      <div className="filter-bar">
        <label>Filter by Role:</label>
        <select className="role-select" value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)}>
          <option value="">— All Roles —</option>
          {openRoles.map(r => (
            <option key={r.role_id} value={r.role_id}>{r.role} ({r.role_id})</option>
          ))}
        </select>
      </div>

      {/* ── SECTION 1: Pending Candidates ──────────────────────────────────── */}
      <section className="section-card">
        <div className="section-header">
          <span className="section-icon">📋</span>
          <h3>Pending Candidates</h3>
          <span className="count-badge">{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <p className="empty-msg">No pending candidates{selectedRoleId ? ' for this role' : ''}.</p>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Candidate ID</th>
                <th>Name</th>
                <th>Applied Role</th>
                <th>Rounds Done</th>
                <th>Avg Score</th>
                <th>Verdict</th>
                <th>Resume</th>
                <th>Add Interview</th>
                <th>Check Verdict</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(c => {
                const avg              = getOverallAvg(c.interviews || []);
                const verdict          = getVerdictLabel(avg);
                const nextRound        = getNextRound(c.interviews || []);
                const completedCount   = (c.interviews || []).length;
                const lastRound        = completedCount > 0
                  ? Math.max(...(c.interviews || []).map(i => i.round))
                  : null;
                // ✅ Check Verdict active only after 2+ completed rounds
                const canVerdict = completedCount >= 2;

                return (
                  <tr key={c.candidate_id}>
                    <td>{c.candidate_id}</td>
                    <td>{c.name}</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td>
                      {lastRound !== null
                        ? <span className="round-pill">L{lastRound} done</span>
                        : <span className="no-rounds">None yet</span>}
                    </td>
                    <td>
                      {avg !== null
                        ? <strong>{avg.toFixed(2)} / 5</strong>
                        : <span className="no-score">—</span>}
                    </td>
                    <td>
                      {verdict
                        ? <span className={`verdict-tag ${verdict.cls}`}>{verdict.label}</span>
                        : '—'}
                    </td>
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
                        ➕ L{nextRound}
                      </button>
                    </td>
                    <td>
                      <button
                        className={`btn-verdict ${canVerdict ? 'btn-verdict-active' : 'btn-verdict-disabled'}`}
                        onClick={() => canVerdict && handleCheckVerdict(c)}
                        disabled={!canVerdict}
                        title={canVerdict
                          ? 'Check verdict based on avg score'
                          : `Need at least 2 completed rounds (${completedCount} done)`}
                      >
                        🔍 Check Verdict
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── SECTION 2: Scheduled Interviews ────────────────────────────────── */}
      <section className="section-card" style={{ marginTop: '2rem' }}>
        <div className="section-header">
          <span className="section-icon">📅</span>
          <h3>Scheduled Interviews</h3>
          <span className="count-badge">{scheduledRows.length}</span>
        </div>

        {scheduledRows.length === 0 ? (
          <p className="empty-msg">No scheduled interviews{selectedRoleId ? ' for this role' : ''}.</p>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Candidate ID</th>
                <th>Name</th>
                <th>Applied Role</th>
                <th>Round Scheduled</th>
                <th>Rounds Completed</th>
                <th>Interviewer</th>
                <th>Date & Time</th>
                <th>Meeting Link</th>
                <th>Edit</th>
                <th>Cancel</th>
              </tr>
            </thead>
            <tbody>
              {scheduledRows.map(c => {
                const nextRound       = getNextRound(c.interviews || []);
                const completedRounds = (c.interviews || []).length;
                return (
                  <tr key={c.candidate_id}>
                    <td>{c.candidate_id}</td>
                    <td>{c.name}</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td><span className="round-pill">L{nextRound}</span></td>
                    <td>
                      {completedRounds > 0
                        ? <span className="round-pill completed">L{completedRounds} done</span>
                        : <span className="no-rounds">None yet</span>}
                    </td>
                    <td>{c.interview_details?.interviewer_email || '—'}</td>
                    <td>{formatDateTime(c.interview_details?.scheduled_datetime)}</td>
                    <td>
                      {c.interview_details?.meeting_link ? (
                        <a
                          href={c.interview_details.meeting_link}
                          target="_blank" rel="noopener noreferrer"
                          className="meeting-link"
                        >
                          Join 🔗
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <button className="btn-edit" onClick={() => openEditModal(c)}>
                        ✏️ Edit
                      </button>
                    </td>
                    <td>
                      <button className="btn-cancel-interview" onClick={() => handleCancelInterview(c)}>
                        🚫 Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── SECTION 3: Selected Candidates ─────────────────────────────────── */}
      <section className="section-card selected-section" style={{ marginTop: '2rem' }}>
        <div className="section-header">
          <span className="section-icon">🏆</span>
          <h3>Selected Candidates</h3>
          <span className="count-badge">{selected.length}</span>
        </div>

        {selected.length === 0 ? (
          <p className="empty-msg">No candidates selected yet{selectedRoleId ? ' for this role' : ''}.</p>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Candidate ID</th>
                <th>Name</th>
                <th>Applied Role</th>
                <th>Rounds Completed</th>
                <th>Avg Score</th>
                <th>Verdict</th>
                <th>Resume</th>
                <th>Undo</th>
              </tr>
            </thead>
            <tbody>
              {selected.map(c => {
                const avg     = getOverallAvg(c.interviews || []);
                const verdict = getVerdictLabel(avg);
                return (
                  <tr key={c.candidate_id} className="selected-row">
                    <td>{c.candidate_id}</td>
                    <td><strong>{c.name}</strong> 🏆</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td>{(c.interviews || []).length} round(s)</td>
                    <td>{avg !== null ? <strong>{avg.toFixed(2)} / 5</strong> : '—'}</td>
                    <td>
                      {verdict
                        ? <span className={`verdict-tag ${verdict.cls}`}>{verdict.label}</span>
                        : '—'}
                    </td>
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
                      <button
                        className="btn-undo"
                        onClick={() => handleUndo(c, 'selected')}
                        title="Move back to Pending"
                      >
                        ↩️ Undo
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── SECTION 4: Rejected Candidates ─────────────────────────────────── */}
      <section className="section-card rejected-section" style={{ marginTop: '2rem' }}>
        <div className="section-header">
          <span className="section-icon">❌</span>
          <h3>Rejected Candidates</h3>
          <span className="count-badge rejected-badge">{rejected.length}</span>
        </div>

        {rejected.length === 0 ? (
          <p className="empty-msg">No rejected candidates{selectedRoleId ? ' for this role' : ''}.</p>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Candidate ID</th>
                <th>Name</th>
                <th>Applied Role</th>
                <th>Rounds Completed</th>
                <th>Avg Score</th>
                <th>Verdict</th>
                <th>Resume</th>
                <th>Undo</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map(c => {
                const avg     = getOverallAvg(c.interviews || []);
                const verdict = getVerdictLabel(avg);
                return (
                  <tr key={c.candidate_id} className="rejected-row">
                    <td>{c.candidate_id}</td>
                    <td>{c.name}</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td>{(c.interviews || []).length} round(s)</td>
                    <td>{avg !== null ? <strong>{avg.toFixed(2)} / 5</strong> : '—'}</td>
                    <td>
                      {verdict
                        ? <span className={`verdict-tag ${verdict.cls}`}>{verdict.label}</span>
                        : '—'}
                    </td>
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
                      <button
                        className="btn-undo"
                        onClick={() => handleUndo(c, 'rejected')}
                        title="Move back to Pending"
                      >
                        ↩️ Undo
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Modal: Add Next Round ───────────────────────────────────────────── */}
      {modal.open && modal.candidate && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Schedule Round L{getNextRound(modal.candidate.interviews || [])}</h3>
                <p className="modal-sub">
                  <strong>{modal.candidate.name}</strong> &nbsp;·&nbsp;
                  {getRoleName(modal.candidate.applied_role_id) || modal.candidate.applied_role}
                </p>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
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
              {statusMsg && <div className={`status-banner ${statusType}`}>{statusMsg}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeModal} disabled={submitting}>Cancel</button>
              <button className="btn-confirm" onClick={handleSchedule} disabled={submitting}>
                {submitting ? 'Scheduling...' : '📅 Confirm Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Schedule ────────────────────────────────────────────── */}
      {editModal.open && editModal.candidate && (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>✏️ Edit Schedule</h3>
                <p className="modal-sub">
                  <strong>{editModal.candidate.name}</strong> &nbsp;·&nbsp;
                  {getRoleName(editModal.candidate.applied_role_id) || editModal.candidate.applied_role}
                </p>
              </div>
              <button className="modal-close" onClick={closeEditModal}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label>Interviewer Email *</label>
                <input
                  type="email"
                  placeholder="interviewer@company.com"
                  value={editForm.interviewer_email}
                  onChange={e => setEditForm({ ...editForm, interviewer_email: e.target.value })}
                />
                <small className="field-hint">Must match an existing Interviewer account email</small>
              </div>
              <div className="field-group">
                <label>Date & Time *</label>
                <input
                  type="datetime-local"
                  value={editForm.scheduled_datetime}
                  onChange={e => setEditForm({ ...editForm, scheduled_datetime: e.target.value })}
                />
              </div>
              <div className="field-group">
                <label>Meeting Link</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  value={editForm.meeting_link}
                  onChange={e => setEditForm({ ...editForm, meeting_link: e.target.value })}
                />
              </div>
              {statusMsg && <div className={`status-banner ${statusType}`}>{statusMsg}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeEditModal} disabled={submitting}>Cancel</button>
              <button className="btn-confirm" onClick={handleEditSchedule} disabled={submitting}>
                {submitting ? 'Updating...' : '✏️ Update Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}