import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './RolesPage.css';
import { FaEye, FaEdit, FaTrashAlt, FaTimesCircle, FaUndo } from 'react-icons/fa';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const quillModules = {
  toolbar: [
    [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'align': [] }],
    ['link'],
    ['clean']
  ]
};

const quillFormats = [
  'font', 'size',
  'bold', 'italic', 'underline', 'strike',
  'color', 'background',
  'list', 'bullet',
  'align',
  'link'
];

const stripHtml = (html) => {
  if (!html) return 'No description available';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  const raw = (ts && typeof ts === 'object' && ts.$date) ? ts.$date : ts;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

function RolesPage() {
  // ── Get logged-in HR's user_id from localStorage ──────────────────────────
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [openRoles, setOpenRoles] = useState([]);
  const [closedRoles, setClosedRoles] = useState([]);
  const [allRolesGlobal, setAllRolesGlobal] = useState([]); // ← all roles across ALL HRs, for duplicate ID check only
  const [selectedJD, setSelectedJD] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [editVacancyData, setEditVacancyData] = useState({
    role_id: '',
    role: '',
    positions: 0,
    jd_text: ''
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [newRoleData, setNewRoleData] = useState({
    role_id: '',
    role: '',
    positions: 1,
    jd_text: ''
  });

  const [roleIdError, setRoleIdError] = useState('');

  const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

  useEffect(() => {
    fetchRoles();
    fetchAllRolesGlobal();
  }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
      // ── Pass hr_id so we only fetch THIS HR's roles ──────────────────────
      const params = hrId ? { 'hr_id': hrId } : {};
      const response = await axios.get(`${BASE_URL}/get-roles/`, {
        headers: { "ngrok-skip-browser-warning": "true" },
        params
      });
      const roles = response.data;
      setOpenRoles(roles.filter(role => role.status === "open"));
      setClosedRoles(roles.filter(role => role.status === "closed"));
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  // ── Fetch ALL roles across every HR account — used only for Role ID duplicate check ──
  const fetchAllRolesGlobal = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/get-roles/`, {
        headers: { "ngrok-skip-browser-warning": "true" }
        // No hr_id param → returns all roles globally
      });
      setAllRolesGlobal(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch global roles for duplicate check:', err);
    }
  };

  const handleViewJD = (jdText) => {
    setSelectedJD(jdText);
    setShowModal(true);
  };

  const handleClose = async (role_id) => {
    if (window.confirm('Are you sure you want to close this position?')) {
      try {
        await axios.post(`${BASE_URL}/close-role/${role_id}`);
        fetchRoles();
        alert("Role closed successfully.");
      } catch (err) {
        console.error('Error closing role:', err);
        alert("Failed to close role. Please check the backend connection.");
      }
    }
  };

  const handleDelete = async (role_id) => {
    if (window.confirm('Are you sure you want to delete this role?')) {
      try {
        await axios.delete(`${BASE_URL}/delete-role/${role_id}`, {
          headers: { "ngrok-skip-browser-warning": "true" }
        });
        fetchRoles();
        alert('Role deleted successfully.');
      } catch (err) {
        console.error('Error deleting role:', err);
        // ✅ Show the exact backend error (e.g. "cannot delete — interviews scheduled")
        const msg = err.response?.data?.detail || 'Failed to delete role. Please try again.';
        alert(`❌ ${msg}`);
      }
    }
  };

  const handleEdit = (role) => {
    setEditVacancyData({
      role_id: role.role_id,
      role: role.role,
      positions: role.positions,
      jd_text: role.job_description || ''
    });
    setShowEditModal(true);
  };

  const saveVacancyUpdate = async () => {
    try {
      await axios.put(`${BASE_URL}/update-role/${editVacancyData.role_id}`, {
        role: editVacancyData.role,
        positions: Number(editVacancyData.positions),
        job_description: editVacancyData.jd_text
      });
      setShowEditModal(false);
      fetchRoles();
      alert("Role updated successfully.");
    } catch (err) {
      console.error('Failed to update role:', err);
      alert("Failed to update role. Please check the backend connection.");
    }
  };

  const handleReopenRole = async (roleId) => {
    try {
      await axios.put(`${BASE_URL}/update-role/${roleId}`, { status: 'open' });
      fetchRoles();
      alert("Role reopened successfully.");
    } catch (err) {
      console.error('Failed to reopen role:', err);
    }
  };

  const handleRoleIdChange = (e) => {
    const value = e.target.value;
    setNewRoleData({ ...newRoleData, role_id: value });
    // ── Check against ALL roles globally (not just this HR's) ────────────
    const isDuplicate = allRolesGlobal.some(
      (role) => String(role.role_id) === String(value.trim())
    );
    setRoleIdError(isDuplicate ? '⚠️ This Role ID is already taken. Please use a unique ID.' : '');
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    if (roleIdError) return;

    const formData = new FormData();
    formData.append('role_id', newRoleData.role_id);
    formData.append('role', newRoleData.role);
    formData.append('positions', newRoleData.positions);
    formData.append('jd_text', newRoleData.jd_text);
    // ── Tag role with HR account ──────────────────────────────────────────
    if (hrId) formData.append('hr_id', hrId);

    try {
      await axios.post(`${BASE_URL}/add-role/`, formData, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      alert('Role added successfully!');
      setShowAddModal(false);
      setNewRoleData({ role_id: '', role: '', positions: 1, jd_text: '' });
      setRoleIdError('');
      fetchRoles();
      fetchAllRolesGlobal(); // ← keep global list in sync
    } catch (err) {
      console.error('Error adding role:', err);
      if (err.response?.status === 400) {
        setRoleIdError(`⚠️ ${err.response.data.detail}`);
      } else {
        alert('Failed to add role. Check console for details.');
      }
    }
  };

  const renderTable = (roles, isClosed = false) => (
    <table className="table table-bordered mt-4">
      <thead className="table-light">
        <tr>
          <th>Role ID</th>
          <th>Position</th>
          <th>Job Description</th>
          <th>Vacancies</th>
          <th>{isClosed ? 'Closed On' : 'Created On'}</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {roles.map((role) => (
          <tr key={`${role.role_id}_${role.jd_filename}`}>
            <td>{role.role_id}</td>
            <td>{role.role}</td>

            <td className="jd-preview-cell">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <strong style={{ fontSize: '0.85rem' }}>{role.role}</strong>
                <p style={{ fontSize: '0.78rem', color: '#555', margin: 0, textAlign: 'center' }}>
                  {stripHtml(role.job_description).slice(0, 80)}...
                </p>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => handleViewJD(role.job_description)}
                >
                  <FaEye /> View Full JD
                </button>
              </div>
            </td>

            <td>{role.positions}</td>
            <td>{isClosed ? formatTimestamp(role.closed_on) : formatTimestamp(role.created_at)}</td>

            <td>
              {!isClosed ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className="btn btn-outline-primary btn-sm" onClick={() => handleEdit(role)}>
                    <FaEdit /> Edit
                  </button>
                  <button className="btn btn-outline-warning btn-sm" onClick={() => handleClose(role.role_id)}>
                    <FaTimesCircle /> Close
                  </button>
                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(role.role_id)}>
                    <FaTrashAlt /> Delete
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className="btn btn-outline-success btn-sm" onClick={() => handleReopenRole(role.role_id)}>
                    <FaUndo /> Reopen
                  </button>
                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(role.role_id)}>
                    <FaTrashAlt /> Delete
                  </button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="page-wrapper">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Role Management</h1>
        <button className="btn btn-success" onClick={() => setShowAddModal(true)}>
          + Add New Role
        </button>
      </div>

      <h2>Open Positions</h2>
      {renderTable(openRoles, false)}

      <h2 className="mt-5">Closed Positions</h2>
      {renderTable(closedRoles, true)}

      {/* View JD Modal */}
      {showModal && (
        <div className="modal d-block" tabIndex="-1" onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Job Description</h5>
                <FaTimesCircle
                  style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }}
                  onClick={() => setShowModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="jd-view-content" dangerouslySetInnerHTML={{ __html: selectedJD }} />
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const newTab = window.open();
                    newTab.document.write(`<html><head><title>Job Description</title></head><body style="font-family: Segoe UI, sans-serif; padding: 2rem;">${selectedJD}</body></html>`);
                  }}
                >
                  Open in New Tab
                </button>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Edit Role
                  <span style={{ fontSize: '0.85rem', color: '#888', marginLeft: '10px' }}>
                    (Role ID: {editVacancyData.role_id} — not editable)
                  </span>
                </h5>
                <FaTimesCircle
                  style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }}
                  onClick={() => setShowEditModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Role Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editVacancyData.role}
                    onChange={(e) => setEditVacancyData({ ...editVacancyData, role: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Number of Vacancies</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editVacancyData.positions}
                    onChange={(e) => setEditVacancyData({ ...editVacancyData, positions: e.target.value })}
                    min="0"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Job Description</label>
                  <ReactQuill
                    theme="snow"
                    modules={quillModules}
                    formats={quillFormats}
                    value={editVacancyData.jd_text}
                    onChange={(value) => setEditVacancyData({ ...editVacancyData, jd_text: value })}
                    style={{ height: '200px', marginBottom: '50px' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveVacancyUpdate}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Role Modal */}
      {showAddModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New Job Role</h5>
                <FaTimesCircle
                  style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }}
                  onClick={() => { setShowAddModal(false); setRoleIdError(''); }}
                />
              </div>
              <form onSubmit={handleAddRole}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Role ID (Numeric)</label>
                    <input
                      type="text"
                      className={`form-control ${roleIdError ? 'is-invalid' : ''}`}
                      required
                      onChange={handleRoleIdChange}
                    />
                    {roleIdError && (
                      <div className="invalid-feedback d-block" style={{ color: '#dc3545', fontSize: '0.875rem' }}>
                        {roleIdError}
                      </div>
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Role Name</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      onChange={(e) => setNewRoleData({ ...newRoleData, role: e.target.value })}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Number of Vacancies</label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      required
                      onChange={(e) => setNewRoleData({ ...newRoleData, positions: e.target.value })}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Job Description</label>
                    <ReactQuill
                      theme="snow"
                      modules={quillModules}
                      formats={quillFormats}
                      value={newRoleData.jd_text}
                      onChange={(value) => setNewRoleData({ ...newRoleData, jd_text: value })}
                      style={{ height: '200px', marginBottom: '50px' }}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setShowAddModal(false); setRoleIdError(''); }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success" disabled={!!roleIdError}>
                    Save Role
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RolesPage;