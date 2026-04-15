import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ViewCandidates.css';
import { FaTrashAlt, FaEye } from 'react-icons/fa';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

function ViewCandidates() {
  const [roles, setRoles]               = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [candidates, setCandidates]     = useState([]);

  useEffect(() => {
    fetchRoles();
    fetchCandidates();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/get-roles/`, axiosConfig);
      const openRoles = Array.isArray(res.data)
        ? res.data.filter(r => r.status?.toLowerCase().trim() === 'open')
        : [];
      setRoles(openRoles);
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/get-candidates/`, axiosConfig);
      setCandidates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching candidates:', err);
    }
  };

  // const getAvgScore = (candidate, round) => {
  //   if (!candidate || !Array.isArray(candidate.interviews)) return '-';
  //   const roundData = candidate.interviews.find(i => i.round === round);
  //   if (!roundData?.ratings) return '-';
  //   const vals = Object.values(roundData.ratings);
  //   return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
  // };
  const getAvgScore = (candidate, round) => {
  if (!candidate || !Array.isArray(candidate.interviews)) return '-';
  const roundData = candidate.interviews.find(i => i.round === round);
  if (!roundData?.ratings) {
    const maxRound = Math.max(...candidate.interviews.map(i => i.round), 0);
    return round > maxRound ? 'No Need' : '-';
  }
  const vals = Object.values(roundData.ratings);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
};

  // ── Overall avg across ALL rounds ──────────────────────────────────────
  const getOverallAvg = (interviews = []) => {
    if (!interviews.length) return '-';
    let total = 0, count = 0;
    interviews.forEach(i => {
      Object.values(i.ratings || {}).forEach(v => { total += v; count++; });
    });
    return count ? (total / count).toFixed(1) : '-';
  };

  // ── All unique sorted round numbers in a candidate list ────────────────
  const getAllRounds = (list) => {
    const rounds = new Set();
    list.forEach(c => (c.interviews || []).forEach(i => rounds.add(i.round)));
    return [...rounds].sort((a, b) => a - b);
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

  // FIX: split by interview_completed flag, not round count
  const pending   = filtered.filter(c => c.interview_completed !== true);
  const completed = filtered.filter(c => c.interview_completed === true);

  const pendingRounds   = getAllRounds(pending);
  const completedRounds = getAllRounds(completed);

  const renderTable = (list, title, rounds) => (
    <div className="candidate-section">
      <h4>{title}</h4>
      {list.length === 0 ? (
        <p className="empty-message">No candidates in this section.</p>
      ) : (
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Candidate ID</th>
              <th>Name</th>
              {/* Dynamic round columns */}
              {rounds.map(r => <th key={r}>L{r} Avg</th>)}
              <th>Overall Avg</th>
              <th>Resume</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.candidate_id || Math.random()}>
                <td>{c.candidate_id}</td>
                <td>{c.name}</td>
                {rounds.map(r => (
                  <td key={r}>{getAvgScore(c, r)}</td>
                ))}
                <td><strong>{getOverallAvg(c.interviews || [])}</strong></td>
                <td>
                  <button
                    className="btn btn-outline-primary btn-sm"
                    title="View Resume"
                    onClick={() =>
                      window.open(
                        `${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <FaEye />
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

  return (
    <div className="container mt-4">
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
          {renderTable(pending,   'Pending Interviews',   pendingRounds)}
          {renderTable(completed, 'Completed Interviews', completedRounds)}
        </>
      )}
    </div>
  );
}

export default ViewCandidates;