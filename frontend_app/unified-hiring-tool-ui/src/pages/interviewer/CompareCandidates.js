import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './CompareCandidates.css';
import ResumeViewer from '../../components/ResumeViewer';
import ComparisonSection from '../../components/ComparisonSection';

const BASE_URL = "https://unwithering-unattentively-herbert.ngrok-free.dev";
const headers = {
  headers: {
    "ngrok-skip-browser-warning": "true"
  }
};

function CompareCandidates() {

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);

  const [resumeModal, setResumeModal] = useState({
    open: false,
    candidateId: '',
    fileName: ''
  });

  const [comparisonData, setComparisonData] = useState([]);

  


  // Fetch roles
  useEffect(() => {
    axios.get(`${BASE_URL}/get-roles/`, headers)
      .then(res => {

        const roleList = Array.isArray(res.data) ? res.data : res.data.roles || [];

        const openRoles = roleList.filter(role => role.status === 'open');

        setRoles(openRoles);
      })
      .catch(err => console.error("Role fetch error:", err));

  }, []);


  // Fetch candidates based on selected role
  useEffect(() => {

    if (!selectedRoleId) return;

    const fetchCandidates = async () => {

      try {

        const res = await axios.get(`${BASE_URL}/get-candidates/`, headers);

        const candidateList = Array.isArray(res.data)
          ? res.data
          : res.data.candidates || [];

        const roleCandidates = candidateList.filter(
          c => String(c.applied_role_id) === String(selectedRoleId)
        );

        const filtered = [];

        for (let c of roleCandidates) {

          const interviews = c.interviews || [];

          // const hasR1 = interviews.some(r => r.round === 1);
          // const hasR2 = interviews.some(r => r.round === 2);

          // if (hasR1 && hasR2) continue;
          if (c.interview_completed === true) continue;

          try {

            const f = await axios.get(`${BASE_URL}/score-fitment/${c.candidate_id}`, headers);

            filtered.push({
              ...c,
              fitmentData: f.data
            });

          } catch (err) {
            console.error("Fitment fetch failed:", err);
          }

        }

        setCandidates(filtered);

        const role = roles.find(r => String(r.role_id) === String(selectedRoleId));

        setSelectedRoleName(role?.role || '');

      } catch (err) {
        console.error("Candidate fetch error:", err);
      }

    };

    fetchCandidates();

  }, [selectedRoleId, roles]);


  const handleToggle = (id) => {

    setSelectedCandidates(prev =>
      prev.includes(id)
        ? prev.filter(cid => cid !== id)
        : prev.length < 4
          ? [...prev, id]
          : (alert('Max 4 candidates'), prev)
    );

  };


  // FIXED — attach name from candidates list
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

      <select
        className="dropdown"
        onChange={(e) => setSelectedRoleId(e.target.value)}
        value={selectedRoleId}
      >

        <option value="">Select Role</option>

        {roles.map((r) => (
          <option key={r.role_id} value={r.role_id}>
            {r.role}
          </option>
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
                <th>Resume</th>
                <th>Select</th>
              </tr>
            </thead>

            <tbody>

              {candidates.length === 0 ? (
                <tr>
                  <td colSpan="4">No eligible candidates</td>
                </tr>
              ) : (
                candidates.map((c) => (

                  <tr key={c.candidate_id}>

                    <td>{c.candidate_id}</td>

                    <td>{c.name}</td>

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
                        className={`btn-choose ${
                          selectedCandidates.includes(c.candidate_id)
                            ? 'selected'
                            : ''
                        }`}
                        onClick={() => handleToggle(c.candidate_id)}
                      >
                        {selectedCandidates.includes(c.candidate_id)
                          ? 'Selected'
                          : 'Choose'}
                      </button>

                    </td>

                  </tr>

                ))
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
          onClose={() =>
            setResumeModal({
              open: false,
              candidateId: '',
              fileName: ''
            })
          }
        />

      )}

    </div>

  );

}

export default CompareCandidates;