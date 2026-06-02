// src/pages/hr/ViewCandidates.js
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './ViewCandidates.css';
import { FaTrashAlt, FaEye, FaCalendarPlus, FaBriefcase, FaSearch, FaTimes } from 'react-icons/fa';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Toast Component ───────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="vc-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`vc-toast vc-toast--${t.type}`}>
          <span className="vc-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="vc-toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({ config, onConfirm, onCancel }) {
  if (!config) return null;
  return (
    <div className="vc-confirm-overlay" onClick={onCancel}>
      <div className="vc-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="vc-confirm-icon">{config.icon || '❓'}</div>
        <h4 className="vc-confirm-title">{config.title}</h4>
        <p className="vc-confirm-msg">{config.message}</p>
        <div className="vc-confirm-actions">
          <button className="vc-confirm-btn vc-confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`vc-confirm-btn vc-confirm-btn--ok vc-confirm-btn--${config.variant || 'danger'}`}
            onClick={onConfirm}
          >
            {config.confirmLabel || 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Matched Roles Modal ───────────────────────────────────────────────────────
function MatchedRolesModal({ candidate, roles, onClose }) {
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!candidate || !roles.length) return;

    const fetchAllRoleScores = async () => {
      setLoading(true);
      setError(null);
      try {
        // For each role, call talent-pool/search and find this candidate's score
        const settled = await Promise.allSettled(
          roles.map(role =>
            axios.post(
              `${BASE_URL}/talent-pool/search`,
              { role_id: role.role_id, page: 1, page_size: 200 },
              axiosConfig
            ).then(res => {
              const found = (res.data.results || []).find(
                r => String(r.candidate_id) === String(candidate.candidate_id)
              );
              return {
                role_id:    role.role_id,
                role:       role.role,
                department: role.department || '—',
                status:     role.status,
                score:      found ? found.talent_score : null,
              };
            })
          )
        );

        const scored = settled
          .filter(s => s.status === 'fulfilled' && s.value.score !== null)
          .map(s => s.value)
          .sort((a, b) => b.score - a.score);

        setResults(scored);
      } catch (e) {
        setError('Failed to load matched roles.');
      } finally {
        setLoading(false);
      }
    };

    fetchAllRoleScores();
  }, [candidate, roles]);

  if (!candidate) return null;

  const getScoreColor = (score) => {
    if (score >= 70) return '#10b981';
    if (score >= 50) return '#3b82f6';
    if (score >= 30) return '#f97316';
    return '#ef4444';
  };

  const getScoreLabel = (score) => {
    if (score >= 70) return 'Strong Match';
    if (score >= 50) return 'Good Match';
    if (score >= 30) return 'Moderate';
    return 'Weak Match';
  };

  return (
    <div className="vc-modal-overlay" onClick={onClose}>
      <div className="vc-modal-box" onClick={e => e.stopPropagation()}>
        <div className="vc-modal-header">
          <div className="vc-modal-title-group">
            <span className="vc-modal-icon">🎯</span>
            <div>
              <h4 className="vc-modal-title">Matched Roles</h4>
              <p className="vc-modal-subtitle">
                Best role matches for <strong>{candidate.name}</strong>
              </p>
            </div>
          </div>
          <button className="vc-modal-close" onClick={onClose}><FaTimes /></button>
        </div>

        <div className="vc-modal-body">
          {loading ? (
            <div className="vc-modal-loading">
              <div className="vc-modal-spinner" />
              <p>Scoring against {roles.length} roles…</p>
            </div>
          ) : error ? (
            <div className="vc-modal-error">{error}</div>
          ) : results.length === 0 ? (
            <div className="vc-modal-empty">No role matches found.</div>
          ) : (
            <div className="vc-matched-list">
              {results.map((r, i) => (
                <div key={r.role_id} className="vc-matched-row">
                  <div className="vc-matched-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="vc-rank-num">{i + 1}</span>}
                  </div>
                  <div className="vc-matched-info">
                    <div className="vc-matched-role">{r.role}</div>
                    <div className="vc-matched-dept">
                      {r.department}
                      <span className={`vc-role-status-tag ${r.status === 'open' ? 'open' : 'closed'}`}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <div className="vc-matched-score-wrap">
                    <div className="vc-matched-bar-track">
                      <div
                        className="vc-matched-bar-fill"
                        style={{ width: `${r.score}%`, background: getScoreColor(r.score) }}
                      />
                    </div>
                    <div className="vc-matched-score-right">
                      <span className="vc-matched-pct" style={{ color: getScoreColor(r.score) }}>
                        {r.score}%
                      </span>
                      <span className="vc-matched-label" style={{ color: getScoreColor(r.score) }}>
                        {getScoreLabel(r.score)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


  const navigate = useNavigate();

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles]           = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [activeTab, setActiveTab]   = useState('pending');

  // ── Matched Roles modal state ─────────────────────────────────────────────────
  const [matchedRolesCandidate, setMatchedRolesCandidate] = useState(null);

  // ── Candidate search state ────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone]     = useState(false);
  const searchInputRef = useRef(null);

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
    fetchRoles();
    fetchCandidates();
  }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-roles/`, { ...axiosConfig, params });
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching roles:', err);
      showToast('Failed to fetch roles.', 'error');
    }
  };

  const fetchCandidates = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
      setCandidates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching candidates:', err);
      showToast('Failed to fetch candidates.', 'error');
    }
  };

  // ── Score helpers ─────────────────────────────────────────────────────────────
  const getAvgScore = (candidate, round) => {
    if (!candidate || !Array.isArray(candidate.interviews)) return '-';
    const roundData = candidate.interviews.find(i => i.round === round);
    if (!roundData?.ratings) {
      const maxRound = Math.max(...candidate.interviews.map(i => i.round), 0);
      return round > maxRound ? '—' : '-';
    }
    const vals = Object.values(roundData.ratings);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
  };

  const getOverallAvg = (interviews = []) => {
    if (!interviews.length) return '-';
    let total = 0, count = 0;
    interviews.forEach(i => { Object.values(i.ratings || {}).forEach(v => { total += v; count++; }); });
    return count ? (total / count).toFixed(1) : '-';
  };

  const getAtsBadge = (score) => {
    if (score === null || score === undefined)
      return <span className="badge bg-secondary">—</span>;
    if (score >= 75)
      return <span className="badge bg-success" title="ATS: High match">{score.toFixed(1)}% ✓</span>;
    if (score >= 30)
      return <span className="badge bg-warning text-dark" title="ATS: Moderate match">{score.toFixed(1)}% ✓</span>;
    return <span className="badge bg-danger" title="ATS: Below threshold">{score.toFixed(1)}% ✗</span>;
  };

  const getAllRounds = (list) => {
    const rounds = new Set();
    list.forEach(c => (c.interviews || []).forEach(i => rounds.add(i.round)));
    return [...rounds].sort((a, b) => a - b);
  };

  const getStatusLabel = (c) => {
    const interviews = c.interviews || [];
    const completedRounds = interviews.length;
    const scheduledRound =
      c.interview_details?.scheduled_round ?? (completedRounds + 1);
    const feedbackAlreadyDone = interviews.some(i => i.round === scheduledRound);
    const isScheduled = c.status === 'Scheduled' && !feedbackAlreadyDone;

    if (completedRounds === 0 && !isScheduled)
      return <span className="badge bg-secondary">No interviews yet</span>;

    const parts = [];
    if (completedRounds > 0) {
      const maxDone = Math.max(...interviews.map(i => i.round));
      parts.push(
        <span key="done" className="badge bg-primary me-1">L{maxDone} done</span>
      );
    }
    if (isScheduled) {
      parts.push(
        <span key="sched" className="badge bg-warning text-dark">
          L{scheduledRound} Scheduled →{' '}
          {c.interview_details?.interviewer_name || c.interview_details?.interviewer_email || 'Interviewer'}
        </span>
      );
    }
    return <>{parts}</>;
  };

  // ── Action handlers ───────────────────────────────────────────────────────────
  const handleDeleteCandidate = async (id, name) => {
    const yes = await askConfirm({
      icon: '🗑️',
      title: 'Delete this candidate?',
      message: `"${name}" will be permanently removed from the system. This cannot be undone.`,
      confirmLabel: 'Yes, Delete',
      variant: 'danger'
    });
    if (!yes) return;
    try {
      await axios.delete(`${BASE_URL}/delete-candidate/${id}`, axiosConfig);
      fetchCandidates();
      showToast(`${name} deleted successfully.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to delete candidate.';
      showToast(msg, 'error');
    }
  };

  const handleSendToPending = async (candidate) => {
    const score = candidate.ats_score?.toFixed(1) ?? '?';
    const yes = await askConfirm({
      icon: '⚠️',
      title: 'Manually approve this candidate?',
      message: `"${candidate.name}" scored ${score}% on ATS (below the 30% threshold). Are you sure you want to move them to Pending Interviews?`,
      confirmLabel: 'Yes, Send to Pending',
      variant: 'warning'
    });
    if (!yes) return;
    try {
      await axios.post(
        `${BASE_URL}/override-ats-rejection/${candidate.candidate_id}`,
        {}, axiosConfig
      );
      fetchCandidates();
      showToast(`${candidate.name} moved to Pending Interviews.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to move candidate.';
      showToast(msg, 'error');
    }
  };

  const handleRevokeOverride = async (candidate) => {
    const yes = await askConfirm({
      icon: '↩️',
      title: 'Revert manual approval?',
      message: `"${candidate.name}" will move back to the ATS-rejected list.`,
      confirmLabel: 'Yes, Revert',
      variant: 'danger'
    });
    if (!yes) return;
    try {
      await axios.post(
        `${BASE_URL}/revoke-ats-override/${candidate.candidate_id}`,
        {}, axiosConfig
      );
      fetchCandidates();
      showToast(`Manual approval for ${candidate.name} reverted.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to revoke override.';
      showToast(msg, 'error');
    }
  };

  // ── Candidate search ──────────────────────────────────────────────────────────
  const handleCandidateSearch = async () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    setSearchLoading(true);
    setSearchDone(false);
    try {
      // Search locally from already-fetched candidates (fast, no extra API call)
      const matched = candidates.filter(c =>
        (c.name           || '').toLowerCase().includes(q) ||
        (c.candidate_id   || '').toString().toLowerCase().includes(q) ||
        (c.email          || '').toLowerCase().includes(q) ||
        (c.applied_role   || '').toLowerCase().includes(q)
      );
      setSearchResults(matched);
    } finally {
      setSearchLoading(false);
      setSearchDone(true);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchDone(false);
  };


  const filtered = Array.isArray(candidates)
    ? candidates.filter(c => String(c.applied_role_id) === String(selectedRoleId))
    : [];

  const completed = filtered.filter(c => c.candidate_selected || c.candidate_rejected);

  const atsRejected = filtered.filter(c =>
    !c.candidate_selected && !c.candidate_rejected &&
    !c.manual_override &&
    (c.ats_score !== null && c.ats_score !== undefined) &&
    c.ats_score < 30
  );

  const pending = filtered.filter(c =>
    !c.candidate_selected && !c.candidate_rejected &&
    (
      c.ats_score === null ||
      c.ats_score === undefined ||
      c.ats_score >= 30 ||
      c.manual_override === true
    )
  );

  const pendingRounds   = getAllRounds(pending);
  const completedRounds = getAllRounds(completed);

  // ── Section renderers ─────────────────────────────────────────────────────────
  const renderPendingSection = () => (
    pending.length === 0 ? (
      <p className="empty-message">No candidates in this section.</p>
    ) : (
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>Candidate ID</th>
            <th>Name</th>
            <th>ATS Score</th>
            <th>Status</th>
            {pendingRounds.map(r => <th key={r}>L{r} Avg</th>)}
            <th>Overall Avg</th>
            <th>Verdict</th>
            <th>Resume</th>
            <th>Schedule</th>
            <th>Matched Roles</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {pending.map(c => (
            <tr key={c.candidate_id}>
              <td>{c.candidate_id}</td>
              <td>
                {c.name}
                {c.manual_override && (
                  <>
                    <br />
                    <span
                      className="badge bg-info text-dark mt-1"
                      style={{ fontSize: '0.7rem' }}
                      title={`Manually approved by HR despite ATS score of ${c.ats_score?.toFixed(1) ?? '?'}%`}
                    >
                      ⚠️ Manually approved
                    </span>
                    <button
                      className="btn btn-link btn-sm p-0 ms-2"
                      style={{ fontSize: '0.7rem' }}
                      onClick={() => handleRevokeOverride(c)}
                      title="Revert to ATS-rejected"
                    >
                      Undo
                    </button>
                  </>
                )}
              </td>
              <td>{getAtsBadge(c.ats_score)}</td>
              <td>{getStatusLabel(c)}</td>
              {pendingRounds.map(r => <td key={r}>{getAvgScore(c, r)}</td>)}
              <td><strong>{getOverallAvg(c.interviews || [])}</strong></td>
              <td><span className="badge bg-light text-muted">—</span></td>
              <td>
                <button
                  className="btn btn-outline-primary btn-sm"
                  title="View Resume"
                  onClick={() =>
                    window.open(
                      `${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`,
                      '_blank', 'noopener,noreferrer'
                    )
                  }
                >
                  <FaEye />
                </button>
              </td>
              <td>
                <button
                  className="btn btn-outline-success btn-sm"
                  title="Go to Schedule page"
                  onClick={() => navigate('/hr/schedule')}
                >
                  <FaCalendarPlus />
                </button>
              </td>
              <td>
                <button
                  className="btn btn-outline-info btn-sm"
                  title="View best matched roles for this candidate"
                  onClick={() => setMatchedRolesCandidate(c)}
                >
                  <FaBriefcase />
                </button>
              </td>
              <td>
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => handleDeleteCandidate(c.candidate_id, c.name)}
                  title="Delete Candidate"
                >
                  <FaTrashAlt />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  );

  const renderRejectedSection = () => (
    <>
      <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.75rem' }}>
        These candidates scored below 30% on the ATS keyword match.
        Use "Send to Pending" to manually approve candidates you believe may
        still perform well in interviews.
      </p>
      {atsRejected.length === 0 ? (
        <p className="empty-message">No ATS-rejected candidates.</p>
      ) : (
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Candidate ID</th>
              <th>Name</th>
              <th>ATS Score</th>
              <th>Applied Role</th>
              <th>Resume</th>
              <th>Action</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {atsRejected.map(c => (
              <tr key={c.candidate_id} style={{ backgroundColor: '#fff5f5' }}>
                <td>{c.candidate_id}</td>
                <td>{c.name}</td>
                <td>{getAtsBadge(c.ats_score)}</td>
                <td>{c.applied_role}</td>
                <td>
                  <button
                    className="btn btn-outline-primary btn-sm"
                    title="View Resume"
                    onClick={() =>
                      window.open(
                        `${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`,
                        '_blank', 'noopener,noreferrer'
                      )
                    }
                  >
                    <FaEye />
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-outline-warning btn-sm"
                    onClick={() => handleSendToPending(c)}
                    title="Manually approve and move to Pending Interviews"
                  >
                    Send to Pending
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => handleDeleteCandidate(c.candidate_id, c.name)}
                    title="Delete Candidate"
                  >
                    <FaTrashAlt />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );

  const renderCompletedSection = () => (
    completed.length === 0 ? (
      <p className="empty-message">No candidates in this section.</p>
    ) : (
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>Candidate ID</th>
            <th>Name</th>
            <th>ATS Score</th>
            <th>Status</th>
            {completedRounds.map(r => <th key={r}>L{r} Avg</th>)}
            <th>Overall Avg</th>
            <th>Verdict</th>
            <th>Resume</th>
            <th>Schedule</th>
            <th>Matched Roles</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {completed.map(c => {
            const completedCount = (c.interviews || []).length;
            const maxDone = completedCount > 0
              ? Math.max(...(c.interviews || []).map(i => i.round))
              : null;
            return (
              <tr key={c.candidate_id}>
                <td>{c.candidate_id}</td>
                <td>{c.name}</td>
                <td>{getAtsBadge(c.ats_score)}</td>
                <td>
                  {maxDone !== null
                    ? <span className="badge bg-primary">L{maxDone} done</span>
                    : <span className="badge bg-secondary">No interviews</span>}
                </td>
                {completedRounds.map(r => <td key={r}>{getAvgScore(c, r)}</td>)}
                <td><strong>{getOverallAvg(c.interviews || [])}</strong></td>
                <td>
                  {c.candidate_selected
                    ? <span className="badge bg-success">🏆 Selected</span>
                    : <span className="badge bg-danger">❌ Rejected</span>}
                </td>
                <td>
                  <button
                    className="btn btn-outline-primary btn-sm"
                    title="View Resume"
                    onClick={() =>
                      window.open(
                        `${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`,
                        '_blank', 'noopener,noreferrer'
                      )
                    }
                  >
                    <FaEye />
                  </button>
                </td>
                <td>
                  <span
                    className="badge bg-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    title="Interview process completed"
                  >
                    Completed
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-outline-info btn-sm"
                    title="View best matched roles for this candidate"
                    onClick={() => setMatchedRolesCandidate(c)}
                  >
                    <FaBriefcase />
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => handleDeleteCandidate(c.candidate_id, c.name)}
                    title="Delete Candidate"
                  >
                    <FaTrashAlt />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )
  );

  // ── Tab config ────────────────────────────────────────────────────────────────
  const TABS = [
    { key: 'pending',   icon: '⏳', label: 'Pending Interviews',  count: pending.length,     render: renderPendingSection   },
    { key: 'rejected',  icon: '🚫', label: 'ATS Rejected',         count: atsRejected.length, render: renderRejectedSection  },
    { key: 'completed', icon: '✅', label: 'Completed Interviews', count: completed.length,   render: renderCompletedSection },
  ];

  const currentTab = TABS.find(t => t.key === activeTab) || TABS[0];

  return (
    <div className="page-wrapper">

      {/* ── Matched Roles Modal ─────────────────────────────────────────────── */}
      <MatchedRolesModal
        candidate={matchedRolesCandidate}
        roles={roles}
        onClose={() => setMatchedRolesCandidate(null)}
      />

      {/* ── Toast notifications (top-right) ────────────────────────────────── */}
      <Toast toasts={toasts} />

      {/* ── Confirmation dialog ─────────────────────────────────────────────── */}
      <ConfirmDialog
        config={confirmConfig}
        onConfirm={handleConfirmYes}
        onCancel={handleConfirmNo}
      />

      <h3>View Candidates</h3>

      {/* ── Candidate Search Bar ────────────────────────────────────────────── */}
      <div className="vc-search-bar">
        <div className="vc-search-input-wrap">
          <FaSearch className="vc-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="vc-search-input"
            placeholder="Search by name, ID, email or applied role…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) clearSearch(); }}
            onKeyDown={e => e.key === 'Enter' && handleCandidateSearch()}
          />
          {searchQuery && (
            <button className="vc-search-clear" onClick={clearSearch} title="Clear search">
              <FaTimes />
            </button>
          )}
        </div>
        <button
          className="btn btn-primary vc-search-btn"
          onClick={handleCandidateSearch}
          disabled={searchLoading || !searchQuery.trim()}
        >
          {searchLoading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* ── Search Results Panel ────────────────────────────────────────────── */}
      {searchDone && (
        <div className="vc-search-results-panel">
          <div className="vc-search-results-header">
            <span>🔍 Found <strong>{searchResults.length}</strong> candidate{searchResults.length !== 1 ? 's' : ''} matching "{searchQuery}"</span>
            <button className="btn btn-sm btn-outline-secondary" onClick={clearSearch}>Clear</button>
          </div>
          {searchResults.length === 0 ? (
            <p className="empty-message">No candidates match your search.</p>
          ) : (
            <table className="table table-bordered vc-search-table">
              <thead>
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Applied Role</th>
                  <th>ATS Score</th>
                  <th>Status</th>
                  <th>Resume</th>
                  <th>Matched Roles</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map(c => {
                  const status = c.candidate_selected
                    ? <span className="badge bg-success">Selected</span>
                    : c.candidate_rejected
                    ? <span className="badge bg-danger">Rejected</span>
                    : (!c.manual_override && c.ats_score !== null && c.ats_score !== undefined && c.ats_score < 30)
                    ? <span className="badge bg-warning text-dark">ATS Rejected</span>
                    : <span className="badge bg-primary">Pending</span>;
                  return (
                    <tr key={c.candidate_id}>
                      <td>{c.candidate_id}</td>
                      <td>{c.name}</td>
                      <td>{c.email || '—'}</td>
                      <td>{c.applied_role || '—'}</td>
                      <td>{getAtsBadge(c.ats_score)}</td>
                      <td>{status}</td>
                      <td>
                        <button
                          className="btn btn-outline-primary btn-sm"
                          title="View Resume"
                          onClick={() => window.open(`${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`, '_blank', 'noopener,noreferrer')}
                        >
                          <FaEye />
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn btn-outline-info btn-sm"
                          title="View best matched roles"
                          onClick={() => setMatchedRolesCandidate(c)}
                        >
                          <FaBriefcase />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <h3>View Candidates</h3>

      <div className="form-group mb-3">
        <label>Select Role:</label>
        <select
          className="form-select"
          value={selectedRoleId}
          onChange={e => {
            setSelectedRoleId(e.target.value);
            setActiveTab('pending');
          }}
        >
          <option value="">-- Select a Role --</option>
          {roles.map(role => (
            <option key={role.role_id} value={role.role_id}>
              {role.role} ({role.role_id})
            </option>
          ))}
        </select>
      </div>

      {selectedRoleId && (
        <>
          <div className="viewcand-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`viewcand-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                <span className="viewcand-tab-icon">{t.icon}</span>
                <span className="viewcand-tab-label">{t.label}</span>
                <span className={`viewcand-tab-count ${t.key === 'rejected' ? 'count-danger' : ''}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="candidate-section">
            <h4>{currentTab.icon} {currentTab.label}</h4>
            {currentTab.render()}
          </div>
        </>
      )}
    </div>
  );
}

export default ViewCandidates;
