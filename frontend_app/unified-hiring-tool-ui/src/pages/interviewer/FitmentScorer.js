// src/pages/interviewer/FitmentScorer.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import './FitmentScorer.css';
import ResumeViewer from '../../components/ResumeViewer';
import FitmentViewer from '../../components/FitmentViewer';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// Robust "completed" check: prefer the backend flag, fall back to feedback
// history when the flag isn't present (a candidate with at least one recorded
// interview and not currently re-scheduled is treated as completed).
const isCompleted = (c) => {
  if (c.interview_completed === true) return true;
  if (c.interview_completed === false) return false;
  const hasFeedback = Array.isArray(c.interviews) && c.interviews.length > 0;
  return hasFeedback && c.status !== 'Scheduled';
};

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="badge badge-unscored">—</span>;
  if (score >= 75) return <span className="badge badge-high">{score.toFixed(1)}%</span>;
  if (score >= 50) return <span className="badge badge-mid">{score.toFixed(1)}%</span>;
  return <span className="badge badge-low">{score.toFixed(1)}%</span>;
}

function StatusPill({ completed }) {
  return completed
    ? <span className="fs-status fs-status--done">✓ Completed</span>
    : <span className="fs-status fs-status--pending">● Pending</span>;
}

function FitmentScorer() {
  // ── Logged-in interviewer's email ────────────────────────────────────────
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const interviewerEmail = storedUser.email || '';

  const [roles, setRoles]                       = useState([]);
  const [rolesLoading, setRolesLoading]         = useState(true);
  const [allAssignedCandidates, setAllAssignedCandidates] = useState([]);
  const [selectedRoleId, setSelectedRoleId]     = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [inlineScores, setInlineScores]         = useState({});
  const [rescoringId, setRescoringId]           = useState(null);
  const [resumeModal, setResumeModal]           = useState({ open: false, candidateId: '', fileName: '' });
  const [fitmentModal, setFitmentModal]         = useState({ open: false, data: null, loading: false, candidateId: null, candidateName: null });

  // ── Tabs + search ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState('pending'); // 'pending' | 'completed'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Toast (same pattern as the HR portal pages) ──────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── HR name lookup map (hr_id → name) ────────────────────────────────────
  const [hrMap, setHrMap] = useState({});

  // ── Fetch all users to build HR name map ─────────────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/get-users/`, HEADERS)
      .then(res => {
        const map = {};
        (res.data || []).forEach(u => {
          if (u.role === 'HR') map[u.user_id] = u.name;
        });
        setHrMap(map);
      })
      .catch(() => {}); // non-critical, fail silently
  }, []);

  // ── Fetch all candidates assigned to this interviewer, derive roles ───────
  useEffect(() => {
    if (!interviewerEmail) { setRolesLoading(false); return; }
    setRolesLoading(true);
    axios.get(`${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`, HEADERS)
      .then(res => {
        const all = res.data || [];
        setAllAssignedCandidates(all);
        // Build the role list from ALL assigned candidates (pending + completed)
        // so a role with only completed interviews still appears in the dropdown.
        const roleMap = {};
        all.forEach(c => {
          if (c.applied_role_id && c.applied_role) {
            roleMap[String(c.applied_role_id)] = c.applied_role;
          }
        });
        const derivedRoles = Object.entries(roleMap).map(([role_id, role]) => ({ role_id, role }));
        setRoles(derivedRoles);
      })
      .catch(err => {
        console.error('Failed to fetch assigned candidates:', err);
        showToast('Could not load your assigned candidates.', 'error');
      })
      .finally(() => setRolesLoading(false));
  }, [interviewerEmail]);

  // ── Candidates for the selected role (both pending and completed) ─────────
  const roleCandidates = useMemo(() => {
    if (!selectedRoleId) return [];
    return allAssignedCandidates.filter(
      c => String(c.applied_role_id) === String(selectedRoleId)
    );
  }, [allAssignedCandidates, selectedRoleId]);

  // ── Seed cached fitment scores whenever the role's candidate set changes ──
  useEffect(() => {
    const scoreMap = {};
    roleCandidates.forEach(c => {
      if (c.results?.fitment_score !== undefined) {
        scoreMap[c.candidate_id] = c.results.fitment_score;
      }
    });
    setInlineScores(scoreMap);
  }, [roleCandidates]);

  const pendingList   = useMemo(() => roleCandidates.filter(c => !isCompleted(c)), [roleCandidates]);
  const completedList = useMemo(() => roleCandidates.filter(c =>  isCompleted(c)), [roleCandidates]);

  const activeList = activeTab === 'pending' ? pendingList : completedList;

  // ── Apply the search filter (name or candidate ID) ────────────────────────
  const visibleCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      String(c.candidate_id || '').toLowerCase().includes(q)
    );
  }, [activeList, searchQuery]);

  const fetchFitmentData = useCallback(async (candidateId, forceRescore = false, candidateName = '') => {
    if (forceRescore) setRescoringId(candidateId);
    setFitmentModal({ open: true, data: null, loading: true, candidateId, candidateName });
    try {
      const url = forceRescore
        ? `${BASE_URL}/score-fitment/${candidateId}?force_rescore=true`
        : `${BASE_URL}/score-fitment/${candidateId}`;
      const res = await axios.get(url, HEADERS);
      if (res.data?.fitment_score !== undefined) {
        setInlineScores(prev => ({ ...prev, [candidateId]: res.data.fitment_score }));
        if (forceRescore) {
          showToast(`Re-scored ${candidateName || candidateId} — ${res.data.fitment_score.toFixed(1)}%`, 'success');
        }
      }
      setFitmentModal({ open: true, data: res.data, loading: false, candidateId, candidateName });
    } catch (err) {
      console.error('Fitment fetch failed:', err);
      showToast('Fitment analysis failed. Please check backend logs.', 'error');
      setFitmentModal({
        open: true,
        data: { error: 'Fitment analysis failed. Please check backend logs.' },
        loading: false, candidateId, candidateName
      });
    } finally {
      setRescoringId(null);
    }
  }, []);

  const handleRoleChange = (e) => {
    const roleId = e.target.value;
    setSelectedRoleId(roleId);
    setSelectedRoleName(roles.find(r => r.role_id === roleId)?.role || '');
    setSearchQuery('');
  };

  return (
    <div className="fitment-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Fitment Scorer</h2>
          <p className="page-subtitle">Evaluate candidate–role alignment — your assigned candidates only</p>
        </div>
      </div>

      <div className="role-selector-wrap">
        <label className="selector-label">Select Role</label>
        {rolesLoading ? (
          <div className="inline-spinner" />
        ) : (
          <select className="dropdown" onChange={handleRoleChange} value={selectedRoleId}>
            <option value="">— Choose a role —</option>
            {roles.map(role => (
              <option key={role.role_id} value={role.role_id}>{role.role}</option>
            ))}
          </select>
        )}
      </div>

      {selectedRoleName && (
        <div className="table-section">
          <div className="table-header-row">
            <h3 className="section-title">
              Candidates for <span className="role-highlight">{selectedRoleName}</span>
            </h3>
          </div>

          {/* ── Tabs ──────────────────────────────────────────────── */}
          <div className="fs-tabs">
            <button
              className={`fs-tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Pending Interview
              <span className="fs-tab-count">{pendingList.length}</span>
            </button>
            <button
              className={`fs-tab ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed Interview
              <span className="fs-tab-count">{completedList.length}</span>
            </button>
          </div>

          {/* ── Search ────────────────────────────────────────────── */}
          <div className="fs-toolbar">
            <div className="fs-search-wrap">
              <span className="fs-search-icon">🔍</span>
              <input
                type="text"
                className="fs-search-input"
                placeholder="Search by name or candidate ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="fs-search-clear" onClick={() => setSearchQuery('')} title="Clear">✕</button>
              )}
            </div>
            <span className="candidate-count">
              {visibleCandidates.length} candidate{visibleCandidates.length !== 1 ? 's' : ''}
            </span>
          </div>

          {visibleCandidates.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔍</span>
              <p>
                {searchQuery
                  ? `No candidates match “${searchQuery}”.`
                  : activeTab === 'pending'
                    ? 'No pending candidates for this role.'
                    : 'No completed interviews for this role yet.'}
              </p>
            </div>
          ) : (
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  <th>Assigned By (HR)</th>
                  <th>Scheduled Date</th>
                  <th>Interview Status</th>
                  <th>Resume</th>
                  <th>Fitment Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCandidates.map(candidate => {
                  const cachedScore  = inlineScores[candidate.candidate_id];
                  const isRescoring  = rescoringId === candidate.candidate_id;
                  const completed    = isCompleted(candidate);

                  // HR name: prefer live interview_details, then preserved values on the
                  // most recent interviews[] entry (kept after completion), then hrMap.
                  const lastRound = [...(candidate.interviews || [])].sort((a, b) => b.round - a.round)[0];
                  const hrName = candidate.interview_details?.scheduled_by_hr_name
                    || candidate.last_interview_info?.scheduled_by_hr_name
                    || lastRound?.scheduled_by_hr_name
                    || hrMap[candidate.hr_id]
                    || candidate.hr_id
                    || '—';
                  // Scheduled date: same fallback chain so it never blanks after completion.
                  const rawDt = candidate.interview_details?.scheduled_datetime
                    || candidate.interview_details?.scheduled_date
                    || candidate.last_interview_info?.scheduled_datetime
                    || lastRound?.scheduled_datetime
                    || lastRound?.datetime;
                  const scheduledDate = rawDt
                    ? new Date(rawDt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
                    : '—';

                  return (
                    <tr key={candidate.candidate_id}>
                      <td className="id-cell">{candidate.candidate_id}</td>
                      <td className="name-cell">{candidate.name}</td>
                      <td>
                        <span className="hr-tag">👤 {hrName}</span>
                      </td>
                      <td>{scheduledDate}</td>
                      <td>
                        <StatusPill completed={completed} />
                      </td>
                      <td>
                        <button
                          className="btn-resume"
                          onClick={() => setResumeModal({
                            open: true,
                            candidateId: candidate.candidate_id,
                            fileName: candidate.file_name
                          })}
                        >
                          📄 View PDF
                        </button>
                      </td>
                      <td>
                        {isRescoring
                          ? <div className="inline-spinner" />
                          : <ScoreBadge score={cachedScore} />
                        }
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn-fitment"
                          onClick={() => fetchFitmentData(candidate.candidate_id, false, candidate.name)}
                          disabled={isRescoring}
                        >
                          View Fitment
                        </button>
                        <button
                          className="btn-rescore"
                          title="Force re-score (ignores cache)"
                          onClick={() => fetchFitmentData(candidate.candidate_id, true, candidate.name)}
                          disabled={isRescoring}
                        >
                          ↺ Re-score
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

      {resumeModal.open && (
        <ResumeViewer
          candidateId={resumeModal.candidateId}
          fileName={resumeModal.fileName}
          onClose={() => setResumeModal({ open: false, candidateId: '', fileName: '' })}
        />
      )}

      {fitmentModal.open && (
        <FitmentViewer
          fitmentData={fitmentModal.data}
          loading={fitmentModal.loading}
          candidateName={fitmentModal.candidateName}
          onClose={() => setFitmentModal({ open: false, data: null, loading: false, candidateId: null, candidateName: null })}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toast && (
        <div className="fs-toast-container">
          <div className={`fs-toast fs-toast--${toast.type}`}>
            <span className="fs-toast-icon">{toast.type === 'success' ? '✓' : '✕'}</span>
            <span className="fs-toast-msg">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FitmentScorer;
