// src/pages/interviewer/CompareCandidates.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './CompareCandidates.css';
import ResumeViewer from '../../components/ResumeViewer';
import ComparisonSection from '../../components/ComparisonSection';
import { BASE_URL } from '../../services/api';

// const BASE_URL = "https://unwithering-unattentively-herbert.ngrok-free.dev";
const headers = { headers: { "ngrok-skip-browser-warning": "true" } };

// ── Added from FitmentScorer.js ──────────────────────────────────────────
const isCompleted = (c) => {
  if (c.interview_completed === true) return true;
  if (c.interview_completed === false) return false;
  const hasFeedback = Array.isArray(c.interviews) && c.interviews.length > 0;
  return hasFeedback && c.status !== 'Scheduled';
};

function StatusPill({ completed }) {
  return completed
    ? <span className="fs-status fs-status--done">✓ Completed</span>
    : <span className="fs-status fs-status--pending">● Pending</span>;
}
// ─────────────────────────────────────────────────────────────────────────

function CompareCandidates() {
  // ── Logged-in interviewer's email ────────────────────────────────────────
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const interviewerEmail = storedUser.email || '';

  const [roles, setRoles]                     = useState([]);
  const [rolesLoading, setRolesLoading]       = useState(true);
  const [allAssignedCandidates, setAllAssignedCandidates] = useState([]);
  const [selectedRoleId, setSelectedRoleId]   = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [candidates, setCandidates]           = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [comparisonData, setComparisonData]   = useState([]);
  const [comparing, setComparing]             = useState(false);
  const [resumeModal, setResumeModal]         = useState({ open: false, candidateId: '', fileName: '' });

  // ── HR name lookup map ───────────────────────────────────────────────────
  const [hrMap, setHrMap] = useState({});

  // ── Fetch HR users to build name map ─────────────────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/get-users/`, headers)
      .then(res => {
        const map = {};
        (res.data || []).forEach(u => {
          if (u.role === 'HR') map[u.user_id] = u.name;
        });
        setHrMap(map);
      })
      .catch(() => {}); // non-critical
  }, []);

  // ── Fetch all assigned candidates once, derive roles from them ───────────
  useEffect(() => {
    if (!interviewerEmail) { setRolesLoading(false); return; }
    setRolesLoading(true);
    axios.get(`${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`, headers)
      .then(res => {
        const all = Array.isArray(res.data) ? res.data : [];
        setAllAssignedCandidates(all);
        // Derive unique roles only from pending assigned candidates
        const pending = all.filter(c => c.interview_completed !== true);
        const roleMap = {};
        pending.forEach(c => {
          if (c.applied_role_id && c.applied_role) {
            roleMap[String(c.applied_role_id)] = c.applied_role;
          }
        });
        setRoles(Object.entries(roleMap).map(([role_id, role]) => ({ role_id, role })));
      })
      .catch(err => console.error("Candidate fetch error:", err))
      .finally(() => setRolesLoading(false));
  }, [interviewerEmail]);

  // ── Filter candidates from cached list when role changes ─────────────────
  useEffect(() => {
    if (!selectedRoleId) { setCandidates([]); return; }
    const pending = allAssignedCandidates.filter(
      c => String(c.applied_role_id) === String(selectedRoleId) && c.interview_completed !== true
    );
    setCandidates(pending);
    setSelectedRoleName(
      roles.find(r => String(r.role_id) === String(selectedRoleId))?.role || ''
    );
  }, [selectedRoleId, allAssignedCandidates, roles]);

  const handleToggle = (id) => {
    setSelectedCandidates(prev =>
      prev.includes(id)
        ? prev.filter(cid => cid !== id)
        : prev.length < 4
          ? [...prev, id]
          : (alert('Max 4 candidates'), prev)
    );
  };

  const fetchAndShowComparison = async () => {
    setComparing(true);
    try {
      const data = await Promise.all(
        selectedCandidates.map(id =>
          axios.get(`${BASE_URL}/score-fitment/${id}`, headers)
        )
      );
      const enriched = data.map(d => {
        const match = candidates.find(c => c.candidate_id === d.data.candidate_id);
        return {
          ...d.data,
          name: match ? `${match.name} (${match.candidate_id})` : d.data.candidate_id
        };
      });
      setComparisonData(enriched);
    } catch (err) {
      console.error('Comparison load failed:', err);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="compare-page">
      <h2>Compare Candidates</h2>
      <p className="page-subtitle" style={{ color: '#888', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Showing only candidates assigned to you
      </p>

      {rolesLoading ? (
        <div className="inline-spinner" />
      ) : (
        <select
          className="dropdown"
          onChange={(e) => { setSelectedRoleId(e.target.value); setSelectedCandidates([]); setComparisonData([]); }}
          value={selectedRoleId}
        >
          <option value="">— Choose a role —</option>
          {roles.map((r) => (
            <option key={r.role_id} value={r.role_id}>{r.role}</option>
          ))}
        </select>
      )}

      {selectedRoleName && (
        <>
          <p className="note">Select 2 to 4 candidates to compare.</p>

          <table className="candidate-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Assigned By (HR)</th>
                <th>Scheduled Date</th>
                <th>Interview Status</th>
                <th>Resume</th>
                <th>Select</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan="7">No candidates assigned to you for this role.</td>
                </tr>
              ) : (
                candidates.map((c) => {
                  // After feedback, interview_details is cleared by the backend.
                  // Fall back to the most recent interviews[] entry where
                  // scheduled_by_hr_name and scheduled_datetime are now preserved.
                  const lastRound = [...(c.interviews || [])].sort((a, b) => b.round - a.round)[0];
                  const hrName = c.interview_details?.scheduled_by_hr_name
                    || c.last_interview_info?.scheduled_by_hr_name
                    || lastRound?.scheduled_by_hr_name
                    || hrMap[c.hr_id]
                    || c.hr_id
                    || '—';
                  const rawDt = c.interview_details?.scheduled_datetime
                    || c.interview_details?.scheduled_date
                    || c.last_interview_info?.scheduled_datetime
                    || lastRound?.scheduled_datetime
                    || lastRound?.datetime;
                  const scheduledDate = rawDt
                    ? new Date(rawDt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  
                  const completed = isCompleted(c);

                  return (
                    <tr key={c.candidate_id}>
                      <td>{c.candidate_id}</td>
                      <td>{c.name}</td>
                      <td>
                        <span className="hr-tag">👤 {hrName}</span>
                      </td>
                      <td>{scheduledDate}</td>
                      <td>
                        <StatusPill completed={completed} />
                      </td>
                      <td>
                        <a
                          href={`${BASE_URL}/get-resume/${c.candidate_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="resume-link"
                        >
                          View PDF
                        </a>
                      </td>
                      <td>
                        <button
                          className={`btn-choose ${selectedCandidates.includes(c.candidate_id) ? 'selected' : ''}`}
                          onClick={() => handleToggle(c.candidate_id)}
                        >
                          {selectedCandidates.includes(c.candidate_id) ? 'Selected' : 'Choose'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <button
            className="compare-btn"
            onClick={fetchAndShowComparison}
            disabled={selectedCandidates.length < 2 || comparing}
          >
            {comparing ? 'Loading…' : 'See Comparison'}
          </button>
        </>
      )}

      {comparisonData.length > 0 && (
        <ComparisonSection candidates={comparisonData} />
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

export default CompareCandidates;