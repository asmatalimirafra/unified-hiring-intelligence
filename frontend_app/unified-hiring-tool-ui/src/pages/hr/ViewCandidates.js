// src/pages/hr/ViewCandidates.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ViewCandidates.css';
import { FaTrashAlt, FaEye, FaCalendarPlus } from 'react-icons/fa';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

function ViewCandidates() {
  // ── Logged-in HR account ─────────────────────────────────────────────────
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [candidates, setCandidates] = useState([]);

  // Schedule modal state
  const [scheduleModal, setScheduleModal] = useState({ open: false, candidate: null });
  const [interviewers, setInterviewers] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ interviewer_email: '', scheduled_date: '' });
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    fetchRoles();
    fetchCandidates();
    fetchInterviewers();
  }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
      // ── Only fetch this HR's roles ────────────────────────────────────────
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-roles/`, { ...axiosConfig, params });
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
      // ── Only fetch this HR's candidates ──────────────────────────────────
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
      setCandidates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching candidates:', err);
    }
  };

  const fetchInterviewers = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/get-interviewers/`, axiosConfig);
      setInterviewers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching interviewers:', err);
    }
  };

  // ── Schedule interview ────────────────────────────────────────────────────
  const openScheduleModal = (candidate) => {
    setScheduleModal({ open: true, candidate });
    setScheduleForm({ interviewer_email: '', scheduled_date: '' });
    setScheduleStatus('');
  };

  const handleSchedule = async () => {
    if (!scheduleForm.interviewer_email) {
      setScheduleStatus('❌ Please select an interviewer.');
      return;
    }
    setScheduling(true);
    setScheduleStatus('Scheduling...');
    try {
      await axios.post(
        `${BASE_URL}/schedule-interview/`,
        {
          candidate_id: scheduleModal.candidate.candidate_id,
          interviewer_email: scheduleForm.interviewer_email,
          scheduled_date: scheduleForm.scheduled_date || null
        },
        axiosConfig
      );
      setScheduleStatus('✅ Interview scheduled successfully!');
      setTimeout(() => {
        setScheduleModal({ open: false, candidate: null });
        fetchCandidates();
      }, 1200);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to schedule interview.';
      setScheduleStatus(`❌ ${msg}`);
    } finally {
      setScheduling(false);
    }
  };

  // ── Score helpers ─────────────────────────────────────────────────────────
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

  const handleDeleteCandidate = async (id) => {
    if (window.confirm('Are you sure you want to delete this candidate?')) {
      await axios.delete(`${BASE_URL}/delete-candidate/${id}`, axiosConfig);
      fetchCandidates();
    }
  };

  const filtered = Array.isArray(candidates)
    ? candidates.filter(c => String(c.applied_role_id) === String(selectedRoleId))
    : [];

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
              <th>Status</th>
              {rounds.map(r => <th key={r}>L{r} Avg</th>)}
              <th>Overall Avg</th>
              <th>Resume</th>
              <th>Schedule</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.candidate_id || Math.random()}>
                <td>{c.candidate_id}</td>
                <td>{c.name}</td>
                <td>
                  {c.status === 'Scheduled' ? (
                    <span className="badge bg-success">
                      Scheduled → {c.interview_details?.interviewer_name || c.interview_details?.interviewer_email}
                    </span>
                  ) : (
                    <span className="badge bg-secondary">Unscheduled</span>
                  )}
                </td>
                {rounds.map(r => <td key={r}>{getAvgScore(c, r)}</td>)}
                <td><strong>{getOverallAvg(c.interviews || [])}</strong></td>
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
                    title="Schedule Interview"
                    onClick={() => openScheduleModal(c)}
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
          {renderTable(pending, 'Pending Interviews', pendingRounds)}
          {renderTable(completed, 'Completed Interviews', completedRounds)}
        </>
      )}

      {/* ── Schedule Interview Modal ────────────────────────────────────── */}
      {scheduleModal.open && scheduleModal.candidate && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Schedule Interview — <strong>{scheduleModal.candidate.name}</strong>
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setScheduleModal({ open: false, candidate: null })}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Select Interviewer *</label>
                  <select
                    className="form-select"
                    value={scheduleForm.interviewer_email}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewer_email: e.target.value })}
                  >
                    <option value="">-- Select Interviewer --</option>
                    {interviewers.map(i => (
                      <option key={i.interviewer_id} value={i.email}>
                        {i.name} ({i.email}) — {i.department}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Scheduled Date (optional)</label>
                  <input
                    type="date"
                    className="form-control"
                    value={scheduleForm.scheduled_date}
                    onChange={e => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })}
                  />
                </div>
                {scheduleStatus && (
                  <div className={`alert ${scheduleStatus.startsWith('✅') ? 'alert-success' : scheduleStatus.startsWith('❌') ? 'alert-danger' : 'alert-info'}`}>
                    {scheduleStatus}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setScheduleModal({ open: false, candidate: null })}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleSchedule}
                  disabled={scheduling}
                >
                  {scheduling ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ViewCandidates;