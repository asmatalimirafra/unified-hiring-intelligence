// src/pages/hr/ViewCandidates.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './ViewCandidates.css';
import { FaTrashAlt, FaEye, FaCalendarPlus } from 'react-icons/fa';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

function ViewCandidates() {
  const navigate = useNavigate();

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    fetchRoles();
    fetchCandidates();
  }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-roles/`, { ...axiosConfig, params });
      const allRoles = Array.isArray(res.data) ? res.data : [];
      // Show all roles (open + closed) so completed candidates under closed roles still appear
      setRoles(allRoles);
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  };

  const fetchCandidates = async () => {
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
      setCandidates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching candidates:', err);
    }
  };

  // ── Score helpers ──────────────────────────────────────────────────────────
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

  const getAllRounds = (list) => {
    const rounds = new Set();
    list.forEach(c => (c.interviews || []).forEach(i => rounds.add(i.round)));
    return [...rounds].sort((a, b) => a - b);
  };

  // ── Status label: shows rounds done + scheduled state ─────────────────────
  // Uses scheduled_round (stored at scheduling time) to verify a round is truly
  // pending — avoids showing "Scheduled" when status wasn't cleared after feedback.
  const getStatusLabel = (c) => {
    const interviews = c.interviews || [];
    const completedRounds = interviews.length;

    // A candidate is truly scheduled only if:
    // - status is "Scheduled" AND
    // - feedback hasn't been given yet for the scheduled round
    const scheduledRound =
      c.interview_details?.scheduled_round   // stored at scheduling time
      ?? (completedRounds + 1);              // fallback for old records
    const feedbackAlreadyDone = interviews.some(i => i.round === scheduledRound);
    const isScheduled = c.status === 'Scheduled' && !feedbackAlreadyDone;

    if (completedRounds === 0 && !isScheduled) {
      return <span className="badge bg-secondary">No interviews yet</span>;
    }

    const parts = [];

    if (completedRounds > 0) {
      const maxDone = Math.max(...interviews.map(i => i.round));
      parts.push(
        <span key="done" className="badge bg-primary me-1">
          L{maxDone} done
        </span>
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

  const handleDeleteCandidate = async (id) => {
    if (window.confirm('Are you sure you want to delete this candidate?')) {
      await axios.delete(`${BASE_URL}/delete-candidate/${id}`, axiosConfig);
      fetchCandidates();
    }
  };

  const filtered = Array.isArray(candidates)
    ? candidates.filter(c => String(c.applied_role_id) === String(selectedRoleId))
    : [];

  // Pending = not yet selected or rejected
  const pending   = filtered.filter(c => !c.candidate_selected && !c.candidate_rejected);
  // Completed = HR has given a final verdict
  const completed = filtered.filter(c => c.candidate_selected || c.candidate_rejected);

  const pendingRounds   = getAllRounds(pending);
  const completedRounds = getAllRounds(completed);

  // ── Pending table ──────────────────────────────────────────────────────────
  const renderPendingTable = (list, rounds) => (
    <div className="candidate-section">
      <h4>⏳ Pending Interviews</h4>
      {list.length === 0 ? (
        <p className="empty-message">No candidates in this section.</p>
      ) : (
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Candidate ID</th>
              <th>Name</th>
              <th>Status</th>
              {rounds.map(r => <th key={r}>L{r} Avg</th>)}
              <th>Overall Avg</th>
              <th>Verdict</th>
              <th>Resume</th>
              <th>Schedule</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.candidate_id}>
                <td>{c.candidate_id}</td>
                <td>{c.name}</td>
                {/* Status: shows rounds done + scheduled badge */}
                <td>{getStatusLabel(c)}</td>
                {rounds.map(r => <td key={r}>{getAvgScore(c, r)}</td>)}
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
                {/* Schedule: always active (navigate to Schedule page) */}
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
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => handleDeleteCandidate(c.candidate_id)}
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
    </div>
  );

  // ── Completed table ────────────────────────────────────────────────────────
  const renderCompletedTable = (list, rounds) => (
    <div className="candidate-section">
      <h4>✅ Completed Interviews</h4>
      {list.length === 0 ? (
        <p className="empty-message">No candidates in this section.</p>
      ) : (
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Candidate ID</th>
              <th>Name</th>
              <th>Status</th>
              {rounds.map(r => <th key={r}>L{r} Avg</th>)}
              <th>Overall Avg</th>
              <th>Verdict</th>
              <th>Resume</th>
              <th>Schedule</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => {
              const completedCount = (c.interviews || []).length;
              const maxDone = completedCount > 0
                ? Math.max(...(c.interviews || []).map(i => i.round))
                : null;
              return (
                <tr key={c.candidate_id}>
                  <td>{c.candidate_id}</td>
                  <td>{c.name}</td>
                  {/* Status: shows how many rounds were completed */}
                  <td>
                    {maxDone !== null
                      ? <span className="badge bg-primary">L{maxDone} done</span>
                      : <span className="badge bg-secondary">No interviews</span>}
                  </td>
                  {rounds.map(r => <td key={r}>{getAvgScore(c, r)}</td>)}
                  <td><strong>{getOverallAvg(c.interviews || [])}</strong></td>
                  {/* Verdict: Selected or Rejected */}
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
                  {/* Schedule column: static "Completed" badge — no action needed */}
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
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => handleDeleteCandidate(c.candidate_id)}
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
      )}
    </div>
  );

  return (
    <div className="page-wrapper">
      <h3>View Candidates</h3>
      <div className="form-group mb-3">
        <label>Select Role:</label>
        <select
          className="form-select"
          value={selectedRoleId}
          onChange={e => setSelectedRoleId(e.target.value)}
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
          {renderPendingTable(pending,   pendingRounds)}
          {renderCompletedTable(completed, completedRounds)}
        </>
      )}
    </div>
  );
}

export default ViewCandidates;