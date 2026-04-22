// src/pages/interviewer/FitmentScorer.js
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './FitmentScorer.css';
import ResumeViewer from '../../components/ResumeViewer';
import FitmentViewer from '../../components/FitmentViewer';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS = { headers: { 'ngrok-skip-browser-warning': 'true' } };

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="badge badge-unscored">—</span>;
  if (score >= 75) return <span className="badge badge-high">{score.toFixed(1)}%</span>;
  if (score >= 50) return <span className="badge badge-mid">{score.toFixed(1)}%</span>;
  return <span className="badge badge-low">{score.toFixed(1)}%</span>;
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
  const [candidates, setCandidates]             = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [inlineScores, setInlineScores]         = useState({});
  const [rescoringId, setRescoringId]           = useState(null);
  const [resumeModal, setResumeModal]           = useState({ open: false, candidateId: '', fileName: '' });
  const [fitmentModal, setFitmentModal]         = useState({ open: false, data: null, loading: false, candidateId: null, candidateName: null });

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

  // ── Fetch all candidates assigned to this interviewer, derive roles from them ──
  useEffect(() => {
    if (!interviewerEmail) { setRolesLoading(false); return; }
    setRolesLoading(true);
    axios.get(`${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`, HEADERS)
      .then(res => {
        const all = res.data || [];
        setAllAssignedCandidates(all);
        // Build unique roles list only from assigned candidates (pending only)
        const pending = all.filter(c => c.interview_completed !== true);
        const roleMap = {};
        pending.forEach(c => {
          if (c.applied_role_id && c.applied_role) {
            roleMap[String(c.applied_role_id)] = c.applied_role;
          }
        });
        const derivedRoles = Object.entries(roleMap).map(([role_id, role]) => ({ role_id, role }));
        setRoles(derivedRoles);
      })
      .catch(err => console.error('Failed to fetch assigned candidates:', err))
      .finally(() => setRolesLoading(false));
  }, [interviewerEmail]);

  // ── Filter candidates from already-fetched list when role changes ─────────
  useEffect(() => {
    if (!selectedRoleId) { setCandidates([]); return; }
    setCandidatesLoading(true);
    const pending = allAssignedCandidates.filter(
      c => String(c.applied_role_id) === String(selectedRoleId) && c.interview_completed !== true
    );
    setCandidates(pending);
    const scoreMap = {};
    pending.forEach(c => {
      if (c.results?.fitment_score !== undefined) {
        scoreMap[c.candidate_id] = c.results.fitment_score;
      }
    });
    setInlineScores(scoreMap);
    setCandidatesLoading(false);
  }, [selectedRoleId, allAssignedCandidates]);

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
      }
      setFitmentModal({ open: true, data: res.data, loading: false, candidateId, candidateName });
    } catch (err) {
      console.error('Fitment fetch failed:', err);
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
    setInlineScores({});
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
            <option value="">— Choose an open role —</option>
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
            {!candidatesLoading && (
              <span className="candidate-count">
                {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {candidatesLoading ? (
            <div className="loading-state">
              <div className="inline-spinner large" />
              <p>Loading candidates…</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔍</span>
              <p>No candidates assigned to you for this role.</p>
            </div>
          ) : (
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  <th>Assigned By (HR)</th>
                  <th>Scheduled Date</th>
                  <th>Resume</th>
                  <th>Fitment Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => {
                  const cachedScore  = inlineScores[candidate.candidate_id];
                  const isRescoring  = rescoringId === candidate.candidate_id;
                  // HR name: prefer what's stored directly on interview_details, fall back to hrMap lookup
                  const hrName = candidate.interview_details?.scheduled_by_hr_name
                    || candidate.last_interview_info?.scheduled_by_hr_name
                    || hrMap[candidate.hr_id]
                    || candidate.hr_id
                    || '—';
                  // Support both field names and last_interview_info fallback
                  const rawDt = candidate.interview_details?.scheduled_datetime
                    || candidate.interview_details?.scheduled_date
                    || candidate.last_interview_info?.scheduled_datetime;
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
    </div>
  );
}

export default FitmentScorer;