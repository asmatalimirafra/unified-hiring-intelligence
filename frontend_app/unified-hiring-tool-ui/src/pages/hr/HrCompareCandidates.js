// src/pages/hr/HrCompareCandidates.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './HrCompareCandidates.css';
import ResumeViewer from '../../components/ResumeViewer';
import ComparisonSection from '../../components/ComparisonSection';
import { BASE_URL } from '../../services/api';

// const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS  = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Pipeline status helper ────────────────────────────────────────────────────
function getPipelineStatus(c) {
  if (c.candidate_joined)       return { label: 'Joined',             cls: 'hrc-status-joined'     };
  if (c.candidate_not_joined)   return { label: 'Not Joined',         cls: 'hrc-status-not-joined' };
  if (c.candidate_selected)     return { label: 'Selected',           cls: 'hrc-status-selected'   };
  if (c.candidate_rejected)     return { label: 'Interview Rejected', cls: 'hrc-status-rejected'   };
  if (c.status === 'Scheduled') return { label: 'Scheduled',          cls: 'hrc-status-scheduled'  };
  if ((c.ats_score ?? 100) < 30 && !c.manual_override)
                                return { label: 'ATS Rejected',       cls: 'hrc-status-ats'        };
  return                               { label: 'Pending',            cls: 'hrc-status-pending'    };
}

// ── Component ─────────────────────────────────────────────────────────────────
function HrCompareCandidates() {
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles]                       = useState([]);
  const [allCandidates, setAllCandidates]       = useState([]);
  const [selectedRoleId, setSelectedRoleId]     = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [candidates, setCandidates]             = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedIds, setSelectedIds]           = useState([]);
  const [comparisonData, setComparisonData]     = useState([]);
  const [comparing, setComparing]               = useState(false);
  const [searchTerm, setSearchTerm]             = useState('');
  const [resumeModal, setResumeModal]           = useState({ open: false, candidateId: '', fileName: '' });

  // ── Fetch roles and candidates exactly like ViewCandidates.js ────────────
  useEffect(() => {
    const params = hrId ? { hr_id: hrId } : {};

    Promise.all([
      axios.get(`${BASE_URL}/get-roles/`,      { ...HEADERS, params }),
      axios.get(`${BASE_URL}/get-candidates/`, { ...HEADERS, params }),
    ])
      .then(([rolesRes, candidatesRes]) => {
        setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);

        // Exclude joined candidates
        const eligible = (candidatesRes.data || []).filter(c => !c.candidate_joined);
        setAllCandidates(eligible);
      })
      .catch(err => console.error('Fetch error:', err))
      .finally(() => setLoading(false));
  }, [hrId]);

  // ── Filter by selected role ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedRoleId) { setCandidates([]); return; }
    setCandidates(allCandidates.filter(
      c => String(c.applied_role_id) === String(selectedRoleId)
    ));
    setSelectedIds([]);
    setComparisonData([]);
    setSearchTerm('');
  }, [selectedRoleId, allCandidates]);

  const handleRoleChange = (e) => {
    const roleId = e.target.value;
    setSelectedRoleId(roleId);
    setSelectedRoleName(roles.find(r => String(r.role_id) === String(roleId))?.role || '');
  };

  const handleToggle = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4)  { alert('Maximum 4 candidates can be compared at once.'); return prev; }
      return [...prev, id];
    });
    setComparisonData([]);
  };

  const fetchComparison = async () => {
    if (selectedIds.length < 2) return;
    setComparing(true);
    try {
      const results = await Promise.all(
        selectedIds.map(id => axios.get(`${BASE_URL}/score-fitment/${id}`, HEADERS))
      );
      const enriched = results.map(r => {
        const match = candidates.find(c => c.candidate_id === r.data.candidate_id);
        return {
          ...r.data,
          name: match ? `${match.name} (${match.candidate_id})` : r.data.candidate_id
        };
      });
      setComparisonData(enriched);
    } catch (err) {
      console.error('Comparison failed:', err);
      alert('Failed to fetch fitment data for one or more candidates. Please try again.');
    } finally {
      setComparing(false);
    }
  };

  const visibleCandidates = candidates.filter(c =>
    !searchTerm ||
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.candidate_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="hrc-page">

      <div className="hrc-header">
        <div>
          <h2 className="hrc-title">Compare Candidates</h2>
          <p className="hrc-subtitle">
            Select 2–4 candidates from the same role and compare their fitment side by side
          </p>
        </div>
      </div>

      <div className="hrc-controls">
        <div className="hrc-selector-wrap">
          <label className="hrc-label">Select Role</label>
          {loading ? (
            <div className="hrc-spinner" />
          ) : (
            <select className="hrc-dropdown" onChange={handleRoleChange} value={selectedRoleId}>
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
          <div className="hrc-search-wrap">
            <label className="hrc-label">Search</label>
            <input
              className="hrc-search"
              type="text"
              placeholder="Filter by name or ID…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        )}

        {selectedIds.length >= 2 && (
          <button
            className="hrc-compare-btn"
            onClick={fetchComparison}
            disabled={comparing}
          >
            {comparing
              ? <><span className="hrc-btn-spinner" /> Loading…</>
              : `Compare Candidates (${selectedIds.length})`}
          </button>
        )}
      </div>

      {selectedRoleName && selectedIds.length === 1 && (
        <p className="hrc-hint">Select at least 1 more candidate to compare.</p>
      )}

      {selectedRoleName && (
        <div className="hrc-table-section">
          <div className="hrc-table-header-row">
            <h3 className="hrc-section-title">
              Candidates for <span className="hrc-role-hl">{selectedRoleName}</span>
            </h3>
            <span className="hrc-count">
              {visibleCandidates.length} candidate{visibleCandidates.length !== 1 ? 's' : ''}
              {selectedIds.length > 0 && (
                <span className="hrc-selected-pill"> · {selectedIds.length} selected</span>
              )}
            </span>
          </div>

          {visibleCandidates.length === 0 ? (
            <div className="hrc-empty-state">
              <span>🔍</span>
              <p>{searchTerm ? 'No candidates match your search.' : 'No candidates for this role.'}</p>
            </div>
          ) : (
            <div className="hrc-table-wrap">
              <table className="hrc-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Candidate ID</th>
                    <th>Name</th>
                    <th>Pipeline Status</th>
                    <th>ATS Score</th>
                    <th>Fitment Score</th>
                    <th>Resume</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandidates.map(c => {
                    const status   = getPipelineStatus(c);
                    const isChosen = selectedIds.includes(c.candidate_id);
                    const fitScore = c.results?.fitment_score;
                    const atsScore = c.ats_score;

                    return (
                      <tr
                        key={c.candidate_id}
                        className={isChosen ? 'hrc-row-selected' : ''}
                        onClick={() => handleToggle(c.candidate_id)}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            className={`hrc-choose-btn ${isChosen ? 'chosen' : ''}`}
                            onClick={() => handleToggle(c.candidate_id)}
                          >
                            {isChosen ? '✓ Selected' : 'Choose'}
                          </button>
                        </td>
                        <td className="hrc-id-cell">{c.candidate_id}</td>
                        <td className="hrc-name-cell">{c.name}</td>
                        <td>
                          <span className={`hrc-status-badge ${status.cls}`}>
                            {status.label}
                          </span>
                        </td>
                        <td>
                          {atsScore !== undefined
                            ? <span className={`hrc-ats-pill ${atsScore >= 30 ? 'ats-ok' : 'ats-low'}`}>
                                {atsScore.toFixed(1)}%
                              </span>
                            : '—'}
                        </td>
                        <td>
                          {fitScore !== undefined
                            ? <span className={`hrc-fit-pill ${fitScore >= 75 ? 'fit-high' : fitScore >= 50 ? 'fit-mid' : 'fit-low'}`}>
                                {fitScore.toFixed(1)}%
                              </span>
                            : <span className="hrc-fit-pill fit-none">Not scored</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            className="hrc-resume-btn"
                            onClick={() => setResumeModal({
                              open: true,
                              candidateId: c.candidate_id,
                              fileName: c.file_name
                            })}
                          >
                            📄 View PDF
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

      {comparisonData.length > 0 && (
        <div className="hrc-comparison-wrap">
          <ComparisonSection candidates={comparisonData} />
        </div>
      )}

      {resumeModal.open && (
        <ResumeViewer
          candidateId={resumeModal.candidateId}
          fileName={resumeModal.fileName}
          onClose={() => setResumeModal({ open: false, candidateId: '', fileName: '' })}
        />
      )}
    </div>
  );
}

export default HrCompareCandidates;