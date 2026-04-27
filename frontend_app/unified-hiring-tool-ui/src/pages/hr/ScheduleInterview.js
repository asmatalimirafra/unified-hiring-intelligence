// src/pages/hr/ScheduleInterview.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ScheduleInterview.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Score helpers ──────────────────────────────────────────────────────────────

function getRoundAvg(interviews = [], round) {
  const r = interviews.find(i => i.round === round);
  if (!r?.ratings) return null;
  const vals = Object.values(r.ratings);
  if (!vals.length) return null;
  const raw = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(raw * 100) / 100; // round to 2dp to avoid floating point drift
}

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

// Returns the avg of the most recently completed round only
function getLastRoundAvg(interviews = []) {
  if (!interviews.length) return null;
  const lastRound = Math.max(...interviews.map(i => i.round));
  return getRoundAvg(interviews, lastRound);
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

  const [roles,          setRoles]          = useState([]);
  const [allCands,       setAllCands]       = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Schedule modal (add new round)
  const [modal,      setModal]      = useState({ open: false, candidate: null });
  const [form,       setForm]       = useState({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });

  // Edit-schedule modal
  const [editModal,  setEditModal]  = useState({ open: false, candidate: null });
  const [editForm,   setEditForm]   = useState({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });

  // FIX 3: Select confirmation modal
  const [selectModal, setSelectModal] = useState({ open: false, candidate: null });

  // Interviewers popup — shows who conducted which round
  const [interviewersModal, setInterviewersModal] = useState({ open: false, candidate: null });
  const openInterviewersModal  = (c) => setInterviewersModal({ open: true, candidate: c });
  const closeInterviewersModal = ()  => setInterviewersModal({ open: false, candidate: null });

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
      const cands = Array.isArray(res.data) ? res.data : [];
      setAllCands(cands);
      // FIX 1: Auto-reject any pending candidate whose last completed round avg < 3
      autoRejectIfNeeded(cands);
    } catch (err) { console.error('Failed to fetch candidates:', err); }
  };

  // ── Auto-reject candidates who scored < 3 in their latest completed round ────
  // Skips candidates where the interview is still pending (not yet done).
  // Uses the same isTrulyScheduled logic to avoid acting on in-progress interviews.
  const autoRejectIfNeeded = async (cands) => {
    const toReject = cands.filter(c => {
      if (c.candidate_selected || c.candidate_rejected) return false;
      // Skip if interview is scheduled but feedback not yet submitted
      if (c.status === 'Scheduled') {
        const nextRound = getNextRound(c.interviews || []);
        const feedbackDone = (c.interviews || []).some(i => i.round === nextRound);
        if (!feedbackDone) return false; // round truly in progress — do not reject yet
      }
      const lastAvg = getLastRoundAvg(c.interviews || []);
      // Round to 2 decimals to avoid floating point drift (e.g. 2.9999 instead of 3.0)
      return lastAvg !== null && Math.round(lastAvg * 100) / 100 < 3;
    });

    for (const c of toReject) {
      try {
        await axios.post(`${BASE_URL}/reject-candidate/${c.candidate_id}`, {}, axiosConfig);
      } catch (err) {
        console.error(`Auto-reject failed for ${c.candidate_id}:`, err);
      }
    }

    if (toReject.length > 0) {
      try {
        const params = hrId ? { hr_id: hrId } : {};
        const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
        setAllCands(Array.isArray(res.data) ? res.data : []);
      } catch {}
    }
  };

  const getRoleName = (roleId) => {
    const role = roles.find(r => String(r.role_id) === String(roleId));
    return role ? role.role : null;
  };

  const openRoleIds = new Set(
    roles.filter(r => r.status?.toLowerCase().trim() === 'open').map(r => String(r.role_id))
  );
  const openRoles = roles.filter(r => r.status?.toLowerCase().trim() === 'open');

  const applyRoleFilter = (c) =>
    !selectedRoleId || String(c.applied_role_id) === String(selectedRoleId);

  // A candidate is "truly scheduled" only if:
  // - status is "Scheduled"  AND
  // - feedback has NOT yet been submitted for the exact round that was scheduled
  //
  // Uses interview_details.scheduled_round (stored by backend at scheduling time)
  // so the check is stable — it doesn't drift after feedback is added.
  // Falls back to interviews.length + 1 for old records that pre-date this field.
  const isTrulyScheduled = (c) => {
    if (c.status !== 'Scheduled') return false;
    const scheduledRound =
      c.interview_details?.scheduled_round   // ← exact round stored at scheduling time
      ?? (c.interviews || []).length + 1;    // ← fallback for old records
    // If interviews already contains an entry for that round, feedback is done
    const feedbackDone = (c.interviews || []).some(i => i.round === scheduledRound);
    return !feedbackDone;
  };

  // Pending = open role, not selected/rejected, not truly scheduled,
  //           ATS score >= 50% (or no ATS score for old records),
  //           AND last round avg >= 3 (or no rounds done yet)
  const pending = allCands.filter(c => {
    if (!openRoleIds.has(String(c.applied_role_id))) return false;
    if (c.candidate_selected || c.candidate_rejected) return false;
    if (isTrulyScheduled(c)) return false;
    // Exclude ATS-failed candidates (score exists and is < 50)
    if (c.ats_score !== null && c.ats_score !== undefined && c.ats_score < 30) return false; // ATS is a coarse spam filter only — real alignment is measured by Fitment score
    // If rounds are done, only show in pending if last round passed (>= 3)
    const lastAvg = getLastRoundAvg(c.interviews || []);
    if (lastAvg !== null && Math.round(lastAvg * 100) / 100 < 3) return false;
    return applyRoleFilter(c);
  });

  // Scheduled = truly scheduled (interview not yet done)
  const scheduledRows = allCands.filter(c =>
    isTrulyScheduled(c) &&
    !c.candidate_selected &&
    !c.candidate_rejected &&
    applyRoleFilter(c)
  );

  const selected = allCands.filter(c => c.candidate_selected && applyRoleFilter(c));
  const rejected  = allCands.filter(c => c.candidate_rejected && applyRoleFilter(c));


  // ── Modals ─────────────────────────────────────────────────────────────────
  const openModal = (candidate) => {
    setModal({ open: true, candidate });
    setForm({ interviewer_email: '', scheduled_datetime: '', meeting_link: '' });
    setStatusMsg(''); setStatusType('');
  };
  const closeModal = () => { setModal({ open: false, candidate: null }); setStatusMsg(''); setStatusType(''); };

  const openEditModal = (candidate) => {
    const d = candidate.interview_details || {};
    let dt = '';
    if (d.scheduled_datetime) {
      try { dt = new Date(d.scheduled_datetime).toISOString().slice(0, 16); } catch {}
    }
    setEditModal({ open: true, candidate });
    setEditForm({ interviewer_email: d.interviewer_email || '', scheduled_datetime: dt, meeting_link: d.meeting_link || '' });
    setStatusMsg(''); setStatusType('');
  };
  const closeEditModal = () => { setEditModal({ open: false, candidate: null }); setStatusMsg(''); setStatusType(''); };

  const openSelectModal  = (c) => setSelectModal({ open: true, candidate: c });
  const closeSelectModal = ()  => setSelectModal({ open: false, candidate: null });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!form.interviewer_email.trim()) { setStatusMsg('Please enter the interviewer email.'); setStatusType('error'); return; }
    if (!form.scheduled_datetime)       { setStatusMsg('Please select a date and time.');       setStatusType('error'); return; }
    if (!form.meeting_link.trim())      { setStatusMsg('Please enter a meeting link.');          setStatusType('error'); return; }
    setSubmitting(true); setStatusMsg('Scheduling...'); setStatusType('info');
    try {
      await axios.post(`${BASE_URL}/schedule-interview/`, {
        candidate_id:       modal.candidate.candidate_id,
        interviewer_email:  form.interviewer_email.trim(),
        scheduled_datetime: form.scheduled_datetime,
        meeting_link:       form.meeting_link.trim(),
        hr_id: hrId, hr_name: hrName,
      }, axiosConfig);
      setStatusMsg('✅ Scheduled!'); setStatusType('success');
      setTimeout(() => { closeModal(); fetchCandidates(); }, 1200);
    } catch (err) {
      setStatusMsg(`❌ ${err.response?.data?.detail || 'Failed. Check the interviewer email.'}`);
      setStatusType('error');
    } finally { setSubmitting(false); }
  };

  const handleEditSchedule = async () => {
    if (!editForm.interviewer_email.trim()) { setStatusMsg('Please enter the interviewer email.'); setStatusType('error'); return; }
    if (!editForm.scheduled_datetime)       { setStatusMsg('Please select a date and time.');       setStatusType('error'); return; }
    if (!editForm.meeting_link.trim())      { setStatusMsg('Please enter a meeting link.');          setStatusType('error'); return; }
    setSubmitting(true); setStatusMsg('Updating...'); setStatusType('info');
    try {
      await axios.post(`${BASE_URL}/schedule-interview/`, {
        candidate_id:       editModal.candidate.candidate_id,
        interviewer_email:  editForm.interviewer_email.trim(),
        scheduled_datetime: editForm.scheduled_datetime,
        meeting_link:       editForm.meeting_link.trim(),
        hr_id: hrId, hr_name: hrName,
      }, axiosConfig);
      setStatusMsg('✅ Updated!'); setStatusType('success');
      setTimeout(() => { closeEditModal(); fetchCandidates(); }, 1200);
    } catch (err) {
      setStatusMsg(`❌ ${err.response?.data?.detail || 'Failed. Check the interviewer email.'}`);
      setStatusType('error');
    } finally { setSubmitting(false); }
  };

  // FIX 4: Cancel only removes the scheduled slot — completed rounds are preserved
  const handleCancelInterview = async (candidate) => {
    const completedCount = (candidate.interviews || []).length;
    const msg = completedCount > 0
      ? `Cancel the scheduled L${completedCount + 1} interview for "${candidate.name}"?\n\n✅ Completed rounds (L1–L${completedCount}) will remain on record.\nOnly the upcoming scheduled slot will be removed.`
      : `Cancel the scheduled interview for "${candidate.name}"?\nThey will move back to Pending (unscheduled).`;
    if (!window.confirm(msg)) return;
    try {
      await axios.post(`${BASE_URL}/unschedule-interview/`, { candidate_id: candidate.candidate_id }, axiosConfig);
      fetchCandidates();
    } catch (err) {
      alert(`❌ ${err.response?.data?.detail || 'Failed to cancel interview. Please try again.'}`);
    }
  };

  // FIX 3: Select from modal
  const handleSelectCandidate = async () => {
    const c = selectModal.candidate;
    try {
      await axios.post(`${BASE_URL}/select-candidate/${c.candidate_id}`, {}, axiosConfig);
      closeSelectModal();
      fetchCandidates();
    } catch {
      alert('Failed to select candidate. Please try again.');
    }
  };

  const handleUndo = async (candidate, from) => {
    if (!window.confirm(`Move "${candidate.name}" back to Pending from ${from === 'selected' ? 'Selected' : 'Rejected'}?`)) return;
    try {
      await axios.post(`${BASE_URL}/undo-candidate-verdict/${candidate.candidate_id}`, {}, axiosConfig);
      fetchCandidates();
    } catch { alert('Failed to undo. Please try again.'); }
  };

  const formatDateTime = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

      {/* ── SECTION 1: Pending ─────────────────────────────────────────────── */}
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
                <th title="Keyword overlap with JD — use Fitment score for deep alignment">ATS %</th>
                <th>Resume</th>
                <th>Add Interview</th>
                <th>Select</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(c => {
                const interviews     = c.interviews || [];
                const avg            = getOverallAvg(interviews);
                const verdict        = getVerdictLabel(avg);
                const nextRound      = getNextRound(interviews);
                const completedCount = interviews.length;
                const lastRound      = completedCount > 0 ? Math.max(...interviews.map(i => i.round)) : null;
                const lastRoundAvg   = getLastRoundAvg(interviews);

                // FIX 2: Block next round if last round avg < 3
                const lastRoundFailed = lastRoundAvg !== null && lastRoundAvg < 3;

                // Select enabled only if ≥2 rounds done AND overall avg ≥ 3
                const canSelect = completedCount >= 2 && avg !== null && avg >= 3;

                return (
                  <tr key={c.candidate_id}>
                    <td>{c.candidate_id}</td>
                    <td>{c.name}</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td>
                      {lastRound !== null
                        ? <span
                            className="round-pill round-pill-clickable"
                            onClick={() => openInterviewersModal(c)}
                            title="Click to see interviewers per round"
                          >
                            L{lastRound} done 👥
                          </span>
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
                      {c.ats_score !== null && c.ats_score !== undefined
                        ? <span className={`ats-badge ${c.ats_score >= 60 ? 'ats-high' : c.ats_score >= 30 ? 'ats-mid' : 'ats-low'}`}>
                            {c.ats_score.toFixed(1)}%
                          </span>
                        : <span className="ats-badge ats-na">—</span>}
                    </td>
                    <td>
                      <a href={`${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`}
                        target="_blank" rel="noopener noreferrer" className="resume-link">
                        View PDF
                      </a>
                    </td>

                    {/* FIX 2: Disabled if last round scored < 3 */}
                    <td>
                      <button
                        className={`btn-schedule ${lastRoundFailed ? 'btn-schedule-disabled' : ''}`}
                        onClick={() => !lastRoundFailed && openModal(c)}
                        disabled={lastRoundFailed}
                        title={lastRoundFailed
                          ? `L${lastRound} avg ${lastRoundAvg.toFixed(2)}/5 — below 3. Candidate will be auto-rejected.`
                          : `Schedule L${nextRound}`}
                      >
                        ➕ L{nextRound}
                      </button>
                    </td>

                    {/* FIX 3: "Select" replaces "Check Verdict" */}
                    <td>
                      <button
                        className={`btn-verdict ${canSelect ? 'btn-verdict-active' : 'btn-verdict-disabled'}`}
                        onClick={() => canSelect && openSelectModal(c)}
                        disabled={!canSelect}
                        title={
                          completedCount < 2 ? `Need at least 2 completed rounds (${completedCount} done)`
                          : avg !== null && avg < 3 ? `Overall avg ${avg.toFixed(2)}/5 is below 3 — cannot select`
                          : 'Review interviews and select candidate'
                        }
                      >
                        ✅ Select
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── SECTION 2: Scheduled ───────────────────────────────────────────── */}
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
                <th>Candidate ID</th><th>Name</th><th>Applied Role</th>
                <th>Round Scheduled</th><th>Rounds Completed</th>
                <th>Interviewer</th><th>Date & Time</th><th>Meeting Link</th>
                <th>Edit</th><th>Cancel</th>
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
                        ? <span
                            className="round-pill completed round-pill-clickable"
                            onClick={() => openInterviewersModal(c)}
                            title="Click to see interviewers per round"
                          >
                            L{completedRounds} done 👥
                          </span>
                        : <span className="no-rounds">None yet</span>}
                    </td>
                    <td>{c.interview_details?.interviewer_email || '—'}</td>
                    <td>{formatDateTime(c.interview_details?.scheduled_datetime)}</td>
                    <td>
                      {c.interview_details?.meeting_link
                        ? <a href={c.interview_details.meeting_link} target="_blank" rel="noopener noreferrer" className="meeting-link">Join 🔗</a>
                        : '—'}
                    </td>
                    <td>
                      <button className="btn-edit" onClick={() => openEditModal(c)}>✏️ Edit</button>
                    </td>
                    {/* FIX 4: Cancel label makes clear only the upcoming slot is cancelled */}
                    <td>
                      <button
                        className="btn-cancel-interview"
                        onClick={() => handleCancelInterview(c)}
                        title={completedRounds > 0
                          ? `Cancel L${nextRound} only — L1–L${completedRounds} records are preserved`
                          : 'Cancel and move back to Pending'}
                      >
                        🚫 Cancel L{nextRound}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── SECTION 3: Selected ────────────────────────────────────────────── */}
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
                <th>Candidate ID</th><th>Name</th><th>Applied Role</th>
                <th>Rounds Completed</th><th>Avg Score</th><th>Verdict</th>
                <th>Resume</th><th>Undo</th>
              </tr>
            </thead>
            <tbody>
              {selected.map(c => {
                const avg = getOverallAvg(c.interviews || []);
                const verdict = getVerdictLabel(avg);
                return (
                  <tr key={c.candidate_id} className="selected-row">
                    <td>{c.candidate_id}</td>
                    <td><strong>{c.name}</strong> 🏆</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td>
                      {(c.interviews || []).length > 0
                        ? <span
                            className="round-pill round-pill-clickable"
                            onClick={() => openInterviewersModal(c)}
                            title="Click to see interviewers per round"
                          >
                            {(c.interviews || []).length} round(s) 👥
                          </span>
                        : <span className="no-rounds">None yet</span>}
                    </td>
                    <td>{avg !== null ? <strong>{avg.toFixed(2)} / 5</strong> : '—'}</td>
                    <td>{verdict ? <span className={`verdict-tag ${verdict.cls}`}>{verdict.label}</span> : '—'}</td>
                    <td>
                      <a href={`${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`}
                        target="_blank" rel="noopener noreferrer" className="resume-link">View PDF</a>
                    </td>
                    <td>
                      <button className="btn-undo" onClick={() => handleUndo(c, 'selected')} title="Move back to Pending">↩️ Undo</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── SECTION 4: Rejected ────────────────────────────────────────────── */}
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
                <th>Candidate ID</th><th>Name</th><th>Applied Role</th>
                <th>Rounds Completed</th><th>Avg Score</th><th>Verdict</th>
                <th>Resume</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map(c => {
                const avg = getOverallAvg(c.interviews || []);
                const verdict = getVerdictLabel(avg);
                return (
                  <tr key={c.candidate_id} className="rejected-row">
                    <td>{c.candidate_id}</td>
                    <td>{c.name}</td>
                    <td>{getRoleName(c.applied_role_id) || c.applied_role}</td>
                    <td>
                      {(c.interviews || []).length > 0
                        ? <span
                            className="round-pill round-pill-clickable"
                            onClick={() => openInterviewersModal(c)}
                            title="Click to see interviewers per round"
                          >
                            {(c.interviews || []).length} round(s) 👥
                          </span>
                        : <span className="no-rounds">None yet</span>}
                    </td>
                    <td>{avg !== null ? <strong>{avg.toFixed(2)} / 5</strong> : '—'}</td>
                    <td>{verdict ? <span className={`verdict-tag ${verdict.cls}`}>{verdict.label}</span> : '—'}</td>
                    <td>
                      <a href={`${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`}
                        target="_blank" rel="noopener noreferrer" className="resume-link">View PDF</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Modal: Schedule Next Round ─────────────────────────────────────── */}
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
                <input type="email" placeholder="interviewer@company.com"
                  value={form.interviewer_email}
                  onChange={e => setForm({ ...form, interviewer_email: e.target.value })} />
                <small className="field-hint">Must match an existing Interviewer account email</small>
              </div>
              <div className="field-group">
                <label>Date & Time *</label>
                <input type="datetime-local" value={form.scheduled_datetime}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={e => setForm({ ...form, scheduled_datetime: e.target.value })} />
              </div>
              <div className="field-group">
                <label>Meeting Link *</label>
                <input type="url" placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  value={form.meeting_link}
                  onChange={e => setForm({ ...form, meeting_link: e.target.value })} />
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
                <input type="email" placeholder="interviewer@company.com"
                  value={editForm.interviewer_email}
                  onChange={e => setEditForm({ ...editForm, interviewer_email: e.target.value })} />
                <small className="field-hint">Must match an existing Interviewer account email</small>
              </div>
              <div className="field-group">
                <label>Date & Time *</label>
                <input type="datetime-local" value={editForm.scheduled_datetime}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={e => setEditForm({ ...editForm, scheduled_datetime: e.target.value })} />
              </div>
              <div className="field-group">
                <label>Meeting Link *</label>
                <input type="url" placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  value={editForm.meeting_link}
                  onChange={e => setEditForm({ ...editForm, meeting_link: e.target.value })} />
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

      {/* ── FIX 3: Modal: Select Candidate ─────────────────────────────────── */}
      {selectModal.open && selectModal.candidate && (() => {
        const c          = selectModal.candidate;
        const interviews = [...(c.interviews || [])].sort((a, b) => a.round - b.round);
        const overall    = getOverallAvg(c.interviews || []);
        const verdict    = getVerdictLabel(overall);
        return (
          <div className="modal-backdrop" onClick={closeSelectModal}>
            <div className="modal-box modal-box-wide" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>Interview Summary — {c.name}</h3>
                  <p className="modal-sub">
                    {getRoleName(c.applied_role_id) || c.applied_role}
                    &nbsp;·&nbsp;
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>{c.candidate_id}</span>
                  </p>
                </div>
                <button className="modal-close" onClick={closeSelectModal}>✕</button>
              </div>

              <div className="modal-body">
                <table className="select-rounds-table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Communication</th>
                      <th>Domain Knowledge</th>
                      <th>Problem Solving</th>
                      <th>Round Avg</th>
                      <th>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((iv, idx) => {
                      const roundAvg = getRoundAvg(c.interviews, iv.round);
                      return (
                        <tr key={idx}>
                          <td><span className="round-pill">L{iv.round}</span></td>
                          <td>{iv.ratings?.communication ?? '—'}</td>
                          <td>{iv.ratings?.domain_knowledge ?? '—'}</td>
                          <td>{iv.ratings?.problem_solving ?? '—'}</td>
                          <td>
                            <strong className={roundAvg !== null && roundAvg >= 3 ? 'score-pass' : 'score-fail'}>
                              {roundAvg !== null ? roundAvg.toFixed(2) : '—'}
                            </strong>
                          </td>
                          <td style={{ maxWidth: '200px', fontSize: '0.85rem', color: '#555' }}>
                            {iv.comments || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="select-summary">
                  <div className="select-overall">
                    <span className="select-overall-label">Overall Average:</span>
                    <strong className={`select-overall-score ${overall >= 3 ? 'score-pass' : 'score-fail'}`}>
                      {overall !== null ? overall.toFixed(2) : '—'} / 5
                    </strong>
                  </div>
                  {verdict && <span className={`verdict-tag ${verdict.cls}`}>{verdict.label}</span>}
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeSelectModal}>Cancel</button>
                <button className="btn-confirm btn-select-confirm" onClick={handleSelectCandidate}>
                  🏆 Select Candidate
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal: Interviewers per Round ──────────────────────────────────── */}
      {interviewersModal.open && interviewersModal.candidate && (() => {
        const c = interviewersModal.candidate;
        const interviews = [...(c.interviews || [])].sort((a, b) => a.round - b.round);
        return (
          <div className="modal-backdrop" onClick={closeInterviewersModal}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3>👥 Interviewers — {c.name}</h3>
                  <p className="modal-sub">
                    {getRoleName(c.applied_role_id) || c.applied_role}
                    &nbsp;·&nbsp;
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>{c.candidate_id}</span>
                  </p>
                </div>
                <button className="modal-close" onClick={closeInterviewersModal}>✕</button>
              </div>
              <div className="modal-body">
                {interviews.length === 0 ? (
                  <p style={{ color: '#888', textAlign: 'center' }}>No interviews completed yet.</p>
                ) : (
                  <table className="select-rounds-table">
                    <thead>
                      <tr>
                        <th>Round</th>
                        <th>Interviewer ID</th>
                        <th>Round Avg</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interviews.map((iv, idx) => {
                        const roundAvg = getRoundAvg(c.interviews, iv.round);
                        const dt = iv.datetime
                          ? new Date(iv.datetime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—';
                        return (
                          <tr key={idx}>
                            <td><span className="round-pill">L{iv.round}</span></td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                {iv.interviewer_id || '—'}
                              </span>
                            </td>
                            <td>
                              <strong className={roundAvg !== null && Math.round(roundAvg * 100) / 100 >= 3 ? 'score-pass' : 'score-fail'}>
                                {roundAvg !== null ? roundAvg.toFixed(2) : '—'}
                              </strong>
                            </td>
                            <td style={{ fontSize: '0.85rem', color: '#555' }}>{dt}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeInterviewersModal}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}