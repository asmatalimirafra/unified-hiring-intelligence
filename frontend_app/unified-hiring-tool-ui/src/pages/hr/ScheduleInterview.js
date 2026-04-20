import React, { useState, useEffect } from 'react';
import './HrLayout.css'; 

const ScheduleInterview = () => {
    const [candidates, setCandidates] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [formData, setFormData] = useState({
        date: '',
        time: '',
        link: '',
        interviewer_email: ''
    });

    // Fetch all candidates from your existing backend route
    const fetchCandidates = async () => {
        try {
            const response = await fetch('http://localhost:8000/get-candidates/');
            const data = await response.json();
            setCandidates(data);
        } catch (error) {
            console.error("Error fetching candidates:", error);
        }
    };

    useEffect(() => {
        fetchCandidates();
    }, []);

    const handleScheduleClick = (candidate) => {
        setSelectedCandidate(candidate);
        setFormData({ date: '', time: '', link: '', interviewer_email: '' });
        setShowModal(true);
    };

    const handleEditClick = (candidate) => {
        setSelectedCandidate(candidate);
        // Pre-fill existing data if editing
        setFormData(candidate.interview_details || { date: '', time: '', link: '', interviewer_email: '' }); 
        setShowModal(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        // Structure the update payload for your existing update-candidate route
        const updatePayload = {
            status: "Scheduled",
            interview_details: formData
        };

        try {
            const response = await fetch(`http://localhost:8000/update-candidate/${selectedCandidate.candidate_id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatePayload)
            });

            if (response.ok) {
                setShowModal(false);
                fetchCandidates(); // Refresh the table
            } else {
                alert("Failed to schedule interview.");
            }
        } catch (error) {
            console.error("Error updating schedule:", error);
        }
    };

    // Filter candidates (If status doesn't exist, they are Pending)
    const pendingCandidates = candidates.filter(c => c.status === 'Pending' || !c.status);
    const scheduledCandidates = candidates.filter(c => c.status === 'Scheduled');

    return (
        <div className="container mt-4">
            <h2>Schedule Interviews</h2>
            <hr />
            
            {/* --- Pending Section --- */}
            <div className="mb-5">
                <h4 className="mb-3">Pending Candidates</h4>
                <table className="table table-striped table-hover">
                    <thead className="table-dark">
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingCandidates.length > 0 ? pendingCandidates.map(c => (
                            <tr key={c.candidate_id}>
                                <td>{c.candidate_id}</td>
                                <td>{c.name}</td>
                                <td>{c.applied_role}</td>
                                <td>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleScheduleClick(c)}>
                                        Schedule Interview
                                    </button>
                                </td>
                            </tr>
                        )) : <tr><td colSpan="4" className="text-center">No pending candidates</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* --- Scheduled Section --- */}
            <div>
                <h4 className="mb-3">Scheduled Interviews</h4>
                <table className="table table-bordered table-hover">
                    <thead className="table-success">
                        <tr>
                            <th>Name</th>
                            <th>Interviewer Email</th>
                            <th>Date & Time</th>
                            <th>Meeting Link</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scheduledCandidates.length > 0 ? scheduledCandidates.map(c => (
                            <tr key={c.candidate_id}>
                                <td>{c.name}</td>
                                <td>{c.interview_details?.interviewer_email}</td>
                                <td>{c.interview_details?.date} at {c.interview_details?.time}</td>
                                <td>
                                    <a href={c.interview_details?.link} target="_blank" rel="noreferrer" className="btn btn-outline-info btn-sm">
                                        Join Meet
                                    </a>
                                </td>
                                <td>
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleEditClick(c)}>
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        )) : <tr><td colSpan="5" className="text-center">No scheduled interviews</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* --- Scheduling Modal --- */}
            {showModal && (
                <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    Schedule Interview: {selectedCandidate?.name}
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                            </div>
                            <form onSubmit={handleFormSubmit}>
                                <div className="modal-body">
                                    <div className="mb-3">
                                        <label>Date</label>
                                        <input type="date" className="form-control" required 
                                            value={formData.date} 
                                            onChange={e => setFormData({...formData, date: e.target.value})} />
                                    </div>
                                    <div className="mb-3">
                                        <label>Time</label>
                                        <input type="time" className="form-control" required 
                                            value={formData.time} 
                                            onChange={e => setFormData({...formData, time: e.target.value})} />
                                    </div>
                                    <div className="mb-3">
                                        <label>Meeting Link</label>
                                        <input type="url" className="form-control" required placeholder="https://meet.google.com/..."
                                            value={formData.link} 
                                            onChange={e => setFormData({...formData, link: e.target.value})} />
                                    </div>
                                    <div className="mb-3">
                                        <label>Interviewer Email</label>
                                        <input type="email" className="form-control" required placeholder="interviewer@mirafra.com"
                                            value={formData.interviewer_email} 
                                            onChange={e => setFormData({...formData, interviewer_email: e.target.value})} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-success">Save Schedule</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduleInterview;