import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './RolesPage.css';
import { FaEye, FaEdit, FaTrashAlt, FaTimesCircle, FaUndo } from 'react-icons/fa';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// ✅ Full toolbar configuration
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

// ✅ Helper to strip HTML tags and entities for plain text preview
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

function RolesPage() {
  const [openRoles, setOpenRoles] = useState([]);
  const [closedRoles, setClosedRoles] = useState([]);
  const [selectedJD, setSelectedJD] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // ✅ editVacancyData holds all editable fields
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

  // ✅ State to hold duplicate Role ID error message
  const [roleIdError, setRoleIdError] = useState('');

  // const BASE_URL = 'http://localhost:8080';
  const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/get-roles/`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const roles = response.data;
      setOpenRoles(roles.filter(role => role.status === "open"));
      setClosedRoles(roles.filter(role => role.status === "closed"));
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const handleViewJD = (jdText) => {
    setSelectedJD(jdText);
    setShowModal(true);
  };

  // ✅ No longer sets positions to 0 on close
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
        await axios.delete(`${BASE_URL}/delete-role/${role_id}`);
        fetchRoles();
      } catch (err) {
        console.error('Error deleting role:', err);
      }
    }
  };

  // ✅ Populate all fields when opening edit modal
  const handleEdit = (role) => {
    setEditVacancyData({
      role_id: role.role_id,
      role: role.role,
      positions: role.positions,
      jd_text: role.job_description || ''
    });
    setShowEditModal(true);
  };

  // ✅ Save all fields to backend
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

  // ✅ No longer hardcodes positions to 1 on reopen
  const handleReopenRole = async (roleId) => {
    try {
      await axios.put(`${BASE_URL}/update-role/${roleId}`, {
        status: 'open',
      });
      fetchRoles();
      alert("Role reopened successfully.");
    } catch (err) {
      console.error('Failed to reopen role:', err);
    }
  };

  // ✅ String comparison on both sides to handle numeric role_id from MongoDB
  const handleRoleIdChange = (e) => {
    const value = e.target.value;
    setNewRoleData({ ...newRoleData, role_id: value });
    const allRoles = [...openRoles, ...closedRoles];
    const isDuplicate = allRoles.some(
      (role) => String(role.role_id) === String(value.trim())
    );
    setRoleIdError(isDuplicate ? '⚠️ This Role ID already exists. Please use a unique ID.' : '');
  };

  const handleAddRole = async (e) => {
    e.preventDefault();

    // ✅ Block submission if frontend already detected a duplicate
    if (roleIdError) return;

    const formData = new FormData();
    formData.append('role_id', newRoleData.role_id);
    formData.append('role', newRoleData.role);
    formData.append('positions', newRoleData.positions);
    formData.append('jd_text', newRoleData.jd_text);

    try {
      await axios.post(`${BASE_URL}/add-role/`, formData);
      alert('Role added successfully!');
      setShowAddModal(false);
      setNewRoleData({ role_id: '', role: '', positions: 1, jd_text: '' });
      setRoleIdError('');
      fetchRoles();
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
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {roles.map((role) => (
          <tr key={`${role.role_id}_${role.jd_filename}`}>
            <td>{role.role_id}</td>
            <td>{role.role}</td>

            {/* ✅ JD preview — strips HTML tags and entities */}
            <td className="jd-preview-cell">
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
    {/* Role Name as bold heading */}
    <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#222', textAlign: 'center' }}>
      {role.role}
    </span>
    {/* First 1-2 lines of JD */}
    <span className="jd-preview-text" style={{ textAlign: 'center' }}>
      {stripHtml(role.job_description).substring(0, 100).trim() + '...'}
    </span>
    {/* Eye icon centered below */}
    <FaEye
      className="icon view"
      onClick={() => handleViewJD(role.job_description)}
      title="View Full JD"
      style={{ cursor: 'pointer', marginTop: '4px' }}
    />
  </div>
</td>

            <td>{role.positions}</td>
            <td className="action-buttons">
              <div className="icon-group">
                {!isClosed ? (
                  <>
                    <FaEdit className="icon edit" onClick={() => handleEdit(role)} title="Edit Role" />
                    <FaTimesCircle className="icon close" onClick={() => handleClose(role.role_id)} title="Close Role" />
                  </>
                ) : (
                  <FaUndo className="icon edit" onClick={() => handleReopenRole(role.role_id)} title="Reopen Role" />
                )}
                <FaTrashAlt className="icon delete" onClick={() => handleDelete(role.role_id)} title="Delete Role" />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="container mt-5">
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

      {/* ✅ View JD Modal — modal-xl for larger size */}
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
                <div
                  className="jd-view-content"
                  dangerouslySetInnerHTML={{ __html: selectedJD }}
                />
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const newTab = window.open();
                    newTab.document.write(`
                      <html>
                        <head><title>Job Description</title></head>
                        <body style="font-family: Segoe UI, sans-serif; padding: 2rem;">
                          ${selectedJD}
                        </body>
                      </html>
                    `);
                  }}
                >
                  Open in New Tab
                </button>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Edit Role Modal — all fields editable except Role ID */}
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

                {/* Role Name */}
                <div className="mb-3">
                  <label className="form-label">Role Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editVacancyData.role}
                    onChange={(e) => setEditVacancyData({ ...editVacancyData, role: e.target.value })}
                  />
                </div>

                {/* Number of Vacancies */}
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

                {/* Job Description — React Quill */}
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
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveVacancyUpdate}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Role Modal with React Quill */}
      {showAddModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New Job Role</h5>
                <FaTimesCircle
                  style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }}
                  onClick={() => {
                    setShowAddModal(false);
                    setRoleIdError('');
                  }}
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

                  {/* ✅ React Quill Rich Text Editor */}
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
                    onClick={() => {
                      setShowAddModal(false);
                      setRoleIdError('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-success"
                    disabled={!!roleIdError}
                  >
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