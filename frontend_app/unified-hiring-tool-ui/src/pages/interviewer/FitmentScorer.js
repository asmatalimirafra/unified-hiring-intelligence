// src/pages/interviewer/FitmentScorer.js
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './FitmentScorer.css';
import ResumeViewer from '../../components/ResumeViewer';
import FitmentViewer from '../../components/FitmentViewer';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS = {
  headers: { 'ngrok-skip-browser-warning': 'true' }
};

// ── Score badge helper ────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="badge badge-unscored">—</span>;
  if (score >= 75) return <span className="badge badge-high">{score.toFixed(1)}%</span>;
  if (score >= 50) return <span className="badge badge-mid">{score.toFixed(1)}%</span>;
  return <span className="badge badge-low">{score.toFixed(1)}%</span>;
}

function FitmentScorer() {
  const [roles, setRoles]                     = useState([]);
  const [rolesLoading, setRolesLoading]       = useState(true);

  const [selectedRoleId, setSelectedRoleId]   = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');

  const [candidates, setCandidates]           = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  // track inline cached scores so table updates without reopening modal
  const [inlineScores, setInlineScores]       = useState({});

  // which candidate is currently being re-scored (shows spinner in that row)
  const [rescoringId, setRescoringId]         = useState(null);

  const [resumeModal, setResumeModal]         = useState({ open: false, candidateId: '', fileName: '' });
  const [fitmentModal, setFitmentModal]       = useState({ open: false, data: null, loading: false, candidateId: null });

  // ── Fetch roles ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/get-roles/`, HEADERS);
        const openRoles = (res.data || []).filter(r => r.status === 'open');
        setRoles(openRoles);
      } catch (err) {
        console.error('Failed to fetch roles:', err);
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  // ── Fetch candidates for selected role ───────────────────────────────────
  useEffect(() => {
    if (!selectedRoleId) {
      setCandidates([]);
      return;
    }
    const fetchCandidates = async () => {
      setCandidatesLoading(true);
      try {
        const res = await axios.get(`${BASE_URL}/get-candidates/`, HEADERS);
        const roleCandidates = (res.data || []).filter(c => c.applied_role_id === selectedRoleId);

        // Only show candidates who haven't completed both rounds
        const pending = roleCandidates.filter(c => {
          const interviews = c.interviews || [];
          const hasR1 = interviews.some(r => r.round === 1);
          const hasR2 = interviews.some(r => r.round === 2);
          return !(hasR1 && hasR2);
        });

        setCandidates(pending);

        // Pre-populate inline scores from any cached results
        const scoreMap = {};
        pending.forEach(c => {
          if (c.results?.fitment_score !== undefined) {
            scoreMap[c.candidate_id] = c.results.fitment_score;
          }
        });
        setInlineScores(scoreMap);
      } catch (err) {
        console.error('Failed to fetch candidates:', err);
      } finally {
        setCandidatesLoading(false);
      }
    };
    fetchCandidates();
  }, [selectedRoleId]);

  // ── View fitment (uses cache unless force_rescore) ────────────────────────
  const fetchFitmentData = useCallback(async (candidateId, forceRescore = false) => {
    if (forceRescore) {
      setRescoringId(candidateId);
    }
    setFitmentModal({ open: true, data: null, loading: true, candidateId });

    try {
      const url = forceRescore
        ? `${BASE_URL}/score-fitment/${candidateId}?force_rescore=true`
        : `${BASE_URL}/score-fitment/${candidateId}`;
      const res = await axios.get(url, HEADERS);

      // Update inline score in table too
      if (res.data?.fitment_score !== undefined) {
        setInlineScores(prev => ({ ...prev, [candidateId]: res.data.fitment_score }));
      }
      setFitmentModal({ open: true, data: res.data, loading: false, candidateId });
    } catch (err) {
      console.error('Fitment fetch failed:', err);
      setFitmentModal({
        open: true,
        data: { error: 'Fitment analysis failed. Please check backend logs.' },
        loading: false,
        candidateId
      });
    } finally {
      setRescoringId(null);
    }
  }, []);

  const handleRoleChange = (e) => {
    const roleId = e.target.value;
    setSelectedRoleId(roleId);
    const role = roles.find(r => r.role_id === roleId);
    setSelectedRoleName(role?.role || '');
    setInlineScores({});
  };

  const closeFitmentModal = () =>
    setFitmentModal({ open: false, data: null, loading: false, candidateId: null });

  const closeResumeModal = () =>
    setResumeModal({ open: false, candidateId: '', fileName: '' });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fitment-page">

      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Fitment Scorer</h2>
          <p className="page-subtitle">Evaluate candidate–role alignment using semantic + skill analysis</p>
        </div>
      </div>

      {/* Role selector */}
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

      {/* Candidate table */}
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
              <p>No pending candidates found for this role.</p>
            </div>
          ) : (
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  <th>Resume</th>
                  <th>Fitment Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => {
                  const cachedScore = inlineScores[candidate.candidate_id];
                  const isRescoring = rescoringId === candidate.candidate_id;

                  return (
                    <tr key={candidate.candidate_id}>
                      <td className="id-cell">{candidate.candidate_id}</td>
                      <td className="name-cell">{candidate.name}</td>
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
                          onClick={() => fetchFitmentData(candidate.candidate_id, false)}
                          disabled={isRescoring}
                        >
                          View Fitment
                        </button>
                        <button
                          className="btn-rescore"
                          title="Force re-score (ignores cache)"
                          onClick={() => fetchFitmentData(candidate.candidate_id, true)}
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

      {/* Modals */}
      {resumeModal.open && (
        <ResumeViewer
          candidateId={resumeModal.candidateId}
          fileName={resumeModal.fileName}
          onClose={closeResumeModal}
        />
      )}

      {fitmentModal.open && (
        <FitmentViewer
          fitmentData={fitmentModal.data}
          loading={fitmentModal.loading}
          onClose={closeFitmentModal}
        />
      )}
    </div>
  );
}

export default FitmentScorer;