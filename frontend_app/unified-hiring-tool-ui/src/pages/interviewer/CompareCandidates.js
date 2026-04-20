// src/pages/interviewer/CompareCandidates.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './CompareCandidates.css';
import ResumeViewer from '../../components/ResumeViewer';
import ComparisonSection from '../../components/ComparisonSection';

const BASE_URL = "https://unwithering-unattentively-herbert.ngrok-free.dev";
const headers = { headers: { "ngrok-skip-browser-warning": "true" } };

function CompareCandidates() {
  // ── Logged-in interviewer's email ────────────────────────────────────────
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const interviewerEmail = storedUser.email || '';

  const [roles, setRoles]                     = useState([]);
  const [selectedRoleId, setSelectedRoleId]   = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [candidates, setCandidates]           = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [comparisonData, setComparisonData]   = useState([]);
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

  // ── Fetch all open roles ─────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/get-roles/`, headers)
      .then(res => {
        const roleList = Array.isArray(res.data) ? res.data : res.data.roles || [];
        setRoles(roleList.filter(role => role.status === 'open'));
      })
      .catch(err => console.error("Role fetch error:", err));
  }, []);

  // ── Fetch candidates assigned to this interviewer for selected role ───────
  useEffect(() => {
    if (!selectedRoleId || !interviewerEmail) return;

    const fetchCandidates = async () => {
      try {
        // Only fetch candidates assigned to this interviewer
        const res = await axios.get(
          `${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`,
          headers
        );
        const candidateList = Array.isArray(res.data) ? res.data : [];
        const roleCandidates = candidateList.filter(
          c => String(c.applied_role_id) === String(selectedRoleId)
        );

        const filtered = [];
        for (let c of roleCandidates) {
          if (c.interview_completed === true) continue;
          try {
            const f = await axios.get(`${BASE_URL}/score-fitment/${c.candidate_id}`, headers);
            filtered.push({ ...c, fitmentData: f.data });
          } catch (err) {
            console.error("Fitment fetch failed:", err);
            filtered.push({ ...c, fitmentData: null });
          }
        }

        setCandidates(filtered);
        setSelectedRoleName(roles.find(r => String(r.role_id) === String(selectedRoleId))?.role || '');
      } catch (err) {
        console.error("Candidate fetch error:", err);
      }
    };

    fetchCandidates();
  }, [selectedRoleId, roles, interviewerEmail]);

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
    }
  };

  return (
    <div className="compare-page">
      <h2>Compare Candidates</h2>
      <p className="page-subtitle" style={{ color: '#888', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Showing only candidates assigned to you
      </p>

      <select
        className="dropdown"
        onChange={(e) => { setSelectedRoleId(e.target.value); setSelectedCandidates([]); setComparisonData([]); }}
        value={selectedRoleId}
      >
        <option value="">Select Role</option>
        {roles.map((r) => (
          <option key={r.role_id} value={r.role_id}>{r.role}</option>
        ))}
      </select>

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
                <th>Resume</th>
                <th>Select</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan="6">No candidates assigned to you for this role.</td>
                </tr>
              ) : (
                candidates.map((c) => {
                  const hrName = hrMap[c.hr_id] || c.hr_id || '—';
                  const scheduledDate = c.interview_details?.scheduled_date
                    ? new Date(c.interview_details.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';

                  return (
                    <tr key={c.candidate_id}>
                      <td>{c.candidate_id}</td>
                      <td>{c.name}</td>
                      <td>
                        <span className="hr-tag">👤 {hrName}</span>
                      </td>
                      <td>{scheduledDate}</td>
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
            disabled={selectedCandidates.length < 2}
          >
            See Comparison
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