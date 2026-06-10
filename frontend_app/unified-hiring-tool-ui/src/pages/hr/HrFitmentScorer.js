// src/pages/hr/HrFitmentScorer.js
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './HrFitmentScorer.css';
import ResumeViewer from '../../components/ResumeViewer';
import FitmentViewer from '../../components/FitmentViewer';
import { BASE_URL } from '../../services/api';

// const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS  = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Pipeline status helper ────────────────────────────────────────────────────
function getPipelineStatus(c) {
  if (c.candidate_joined)       return { label: 'Joined',             cls: 'status-joined'     };
  if (c.candidate_not_joined)   return { label: 'Not Joined',         cls: 'status-not-joined' };
  if (c.candidate_selected)     return { label: 'Selected',           cls: 'status-selected'   };
  if (c.candidate_rejected)     return { label: 'Interview Rejected', cls: 'status-rejected'   };
  if (c.status === 'Scheduled') return { label: 'Scheduled',          cls: 'status-scheduled'  };
  if ((c.ats_score ?? 100) < 30 && !c.manual_override)
                                return { label: 'ATS Rejected',       cls: 'status-ats'        };
  return                               { label: 'Pending',            cls: 'status-pending'    };
}

function ScoreBadge({ score }) {
  if (score === null || score === undefined)
    return <span className="hrf-badge hrf-badge-unscored">—</span>;
  if (score >= 75) return <span className="hrf-badge hrf-badge-high">{score.toFixed(1)}%</span>;
  if (score >= 50) return <span className="hrf-badge hrf-badge-mid">{score.toFixed(1)}%</span>;
  return <span className="hrf-badge hrf-badge-low">{score.toFixed(1)}%</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────
function HrFitmentScorer() {
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles]                       = useState([]);
  const [allCandidates, setAllCandidates]       = useState([]);
  const [selectedRoleId, setSelectedRoleId]     = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [candidates, setCandidates]             = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [inlineScores, setInlineScores]         = useState({});
  const [rescoringId, setRescoringId]           = useState(null);
  const [searchTerm, setSearchTerm]             = useState('');
  const [resumeModal, setResumeModal]           = useState({ open: false, candidateId: '', fileName: '' });
  const [fitmentModal, setFitmentModal]         = useState({ open: false, data: null, loading: false, candidateId: null, candidateName: null });

  // ── Fetch roles and candidates ───────────────────────────────────────────
  useEffect(() => {
    const params = hrId ? { hr_id: hrId } : {};

    Promise.all([
      axios.get(`${BASE_URL}/get-roles/`,      { ...HEADERS, params }),
      axios.get(`${BASE_URL}/get-candidates/`, { ...HEADERS, params }),
    ])
      .then(([rolesRes, candidatesRes]) => {
        setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
        const eligible = (candidatesRes.data || []).filter(c => !c.candidate_joined);
        setAllCandidates(eligible);
      })
      .catch(err => console.error('Fetch error:', err))
      .finally(() => setLoading(false));
  }, [hrId]);

  // ── Filter candidates by selected role ───────────────────────────────────
  useEffect(() => {
    if (!selectedRoleId) { setCandidates([]); return; }
    setCandidatesLoading(true);
    const filtered = allCandidates.filter(
      c => String(c.applied_role_id) === String(selectedRoleId)
    );
    setCandidates(filtered);

    const scoreMap = {};
    filtered.forEach(c => {
      if (c.results?.fitment_score !== undefined)
        scoreMap[c.candidate_id] = c.results.fitment_score;
    });
    setInlineScores(scoreMap);
    setCandidatesLoading(false);
  }, [selectedRoleId, allCandidates]);

  // ── Fetch / rescore fitment ──────────────────────────────────────────────
  // FIX: force_rescore=true is passed as a query param to the backend, which
  // now correctly accepts it via Query(False) and forwards it to
  // score_fitment_logic(candidate_id, force_rescore=True), bypassing the cache
  // and triggering a fresh LLM call. Previously the backend endpoint didn't
  // accept the param at all, so every call returned the cached result.
  const fetchFitmentData = useCallback(async (candidateId, forceRescore = false, candidateName = '') => {
    if (forceRescore) setRescoringId(candidateId);
    setFitmentModal({ open: true, data: null, loading: true, candidateId, candidateName });
    try {
      const url = forceRescore
        ? `${BASE_URL}/score-fitment/${candidateId}?force_rescore=true`
        : `${BASE_URL}/score-fitment/${candidateId}`;
      const res = await axios.get(url, HEADERS);
      if (res.data?.fitment_score !== undefined)
        setInlineScores(prev => ({ ...prev, [candidateId]: res.data.fitment_score }));
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
    setSelectedRoleName(roles.find(r => String(r.role_id) === String(roleId))?.role || '');
    setSearchTerm('');
    setInlineScores({});
  };

  const visibleCandidates = candidates.filter(c =>
    !searchTerm ||
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.candidate_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="hrf-page">

      <div className="hrf-header">
        <div>
          <h2 className="hrf-title">Fitment Scorer</h2>
          <p className="hrf-subtitle">Evaluate candidate–role alignment across all pipeline stages</p>
        </div>
      </div>

      <div className="hrf-controls">
        <div className="hrf-selector-wrap">
          <label className="hrf-label">Select Role</label>
          {loading ? (
            <div className="hrf-spinner" />
          ) : (
            <select className="hrf-dropdown" onChange={handleRoleChange} value={selectedRoleId}>
              <option value="">— Choose a role —</option>
              {roles.map(r => (
                <option key={r.role_id} value={r.role_id}>
                  {r.role} ({r.role_id})
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedRoleName && (
          <div className="hrf-search-wrap">
            <input
              className="hrf-search"
              type="text"
              placeholder="Search by name or ID…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        )}
      </div>

      {selectedRoleName && (
        <div className="hrf-table-section">
          <div className="hrf-table-header-row">
            <h3 className="hrf-section-title">
              Candidates for <span className="hrf-role-hl">{selectedRoleName}</span>
            </h3>
            {!candidatesLoading && (
              <span className="hrf-count">
                {visibleCandidates.length} candidate{visibleCandidates.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {candidatesLoading ? (
            <div className="hrf-loading-state">
              <div className="hrf-spinner hrf-spinner-lg" />
              <p>Loading candidates…</p>
            </div>
          ) : visibleCandidates.length === 0 ? (
            <div className="hrf-empty-state">
              <span className="hrf-empty-icon">🔍</span>
              <p>{searchTerm ? 'No candidates match your search.' : 'No candidates for this role.'}</p>
            </div>
          ) : (
            <div className="hrf-table-wrap">
              <table className="hrf-table">
                <thead>
                  <tr>
                    <th>Candidate ID</th>
                    <th>Name</th>
                    <th>Pipeline Status</th>
                    <th>ATS Score</th>
                    <th>Resume</th>
                    <th>Fitment Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandidates.map(c => {
                    const cachedScore = inlineScores[c.candidate_id];
                    const isRescoring = rescoringId === c.candidate_id;
                    const status      = getPipelineStatus(c);
                    const atsScore    = c.ats_score;

                    return (
                      <tr key={c.candidate_id}>
                        <td className="hrf-id-cell">{c.candidate_id}</td>
                        <td className="hrf-name-cell">{c.name}</td>
                        <td>
                          <span className={`hrf-status-badge ${status.cls}`}>
                            {status.label}
                          </span>
                        </td>
                        <td>
                          {atsScore !== undefined
                            ? <span className={`hrf-ats-pill ${atsScore >= 30 ? 'ats-ok' : 'ats-low'}`}>
                                {atsScore.toFixed(1)}%
                              </span>
                            : '—'}
                        </td>
                        <td>
                          <button
                            className="hrf-btn-resume"
                            onClick={() => setResumeModal({
                              open: true,
                              candidateId: c.candidate_id,
                              fileName: c.file_name
                            })}
                          >
                            📄 View PDF
                          </button>
                        </td>
                        <td>
                          {isRescoring
                            ? <div className="hrf-spinner" />
                            : <ScoreBadge score={cachedScore} />
                          }
                        </td>
                        <td className="hrf-actions-cell">
                          <button
                            className="hrf-btn-fitment"
                            onClick={() => fetchFitmentData(c.candidate_id, false, c.name)}
                            disabled={isRescoring}
                          >
                            Check Fitment
                          </button>
                          <button
                            className="hrf-btn-rescore"
                            title="Force re-score (ignores cache)"
                            onClick={() => fetchFitmentData(c.candidate_id, true, c.name)}
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
            </div>
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

export default HrFitmentScorer;