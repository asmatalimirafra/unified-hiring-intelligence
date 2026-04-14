import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './RolesPage.css';
import { FaEye, FaEdit, FaTrashAlt, FaTimesCircle, FaUndo } from 'react-icons/fa';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';

// ✅ React Quill Configuration
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
  'font', 'size', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'bullet', 'align', 'link'
];

// ✅ Helper to strip HTML for table previews
const stripHtml = (html) => {
  if (!html) return 'No description available';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
};

function RolesPage() {
  const [openRoles, setOpenRoles] = useState([]);
  const [closedRoles, setClosedRoles] = useState([]);
  const [selectedJD, setSelectedJD] = useState('');
  
  // Modals visibility
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form States
  const [editRoleData, setEditRoleData] = useState({
    role_id: '',
    role: '',
    positions: 0,
    job_description: ''
  });

  const [newRoleData, setNewRoleData] = useState({
    role_id: '',
    role: '',
    positions: 1,
    jd_text: ''
  });

  const [roleIdError, setRoleIdError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      setOpenRoles(roles.filter(r => r.status === "open"));
      setClosedRoles(roles.filter(r => r.status === "closed"));
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  // --- Handlers ---

  const handleViewJD = (jdText) => {
    setSelectedJD(jdText);
    setShowViewModal(true);
  };

  const handleEditInit = (role) => {
    setEditRoleData({
      role_id: role.role_id,
      role: role.role,
      positions: role.positions,
      job_description: role.job_description
    });
    setShowEditModal(true);
  };

  const saveFullRoleUpdate = async () => {
    setIsLoading(true);
    try {
      await axios.put(`${BASE_URL}/update-role/${editRoleData.role_id}`, {
        role: editRoleData.role,
        positions: Number(editRoleData.positions),
        job_description: editRoleData.job_description
      });
      setShowEditModal(false);
      fetchRoles();
      alert("Role updated successfully!");
    } catch (err) {
      console.error('Update failed:', err);
      alert("Failed to update role content.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    if (roleIdError) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append('role_id', newRoleData.role_id);
    formData.append('role', newRoleData.role);
    formData.append('positions', newRoleData.positions);
    formData.append('jd_text', newRoleData.jd_text);

    try {
      await axios.post(`${BASE_URL}/add-role/`, formData);
      setShowAddModal(false);
      setNewRoleData({ role_id: '', role: '', positions: 1, jd_text: '' });
      fetchRoles();
    } catch (err) {
      console.error('Add failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseRole = async (role_id) => {
    if (window.confirm('Close this position?')) {
      await axios.post(`${BASE_URL}/close-role/${role_id}`);
      fetchRoles();
    }
  };

  const handleReopenRole = async (role_id) => {
    await axios.put(`${BASE_URL}/update-role/${role_id}`, { status: 'open' });
    fetchRoles();
  };

  const handleDeleteRole = async (role_id) => {
    if (window.confirm('Delete this role permanently?')) {
      await axios.delete(`${BASE_URL}/delete-role/${role_id}`);
      fetchRoles();
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
          <tr key={role.role_id}>
            <td>{role.role_id}</td>
            <td>{role.role}</td>
            <td className="jd-preview-cell">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="jd-preview-text">
                  {stripHtml(role.job_description).substring(0, 100)}...
                </span>
                <FaEye className="icon view" onClick={() => handleViewJD(role.job_description)} />
              </div>
            </td>
            <td>{role.positions}</td>
            <td className="action-buttons">
              <div className="icon-group">
                {!isClosed ? (
                  <>
                    <FaEdit className="icon edit" onClick={() => handleEditInit(role)} title="Edit Role" />
                    <FaTimesCircle className="icon close" onClick={() => handleCloseRole(role.role_id)} title="Close Role" />
                  </>
                ) : (
                  <FaUndo className="icon edit" onClick={() => handleReopenRole(role.role_id)} title="Reopen Role" />
                )}
                <FaTrashAlt className="icon delete" onClick={() => handleDeleteRole(role.role_id)} title="Delete Role" />
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
        <button className="btn btn-success" onClick={() => setShowAddModal(true)}>+ Add New Role</button>
      </div>

      <h2>Open Positions</h2>
      {renderTable(openRoles, false)}

      <h2 className="mt-5">Closed Positions</h2>
      {renderTable(closedRoles, true)}

      {/* --- View JD Modal --- */}
      {showViewModal && (
        <div className="modal d-block" tabIndex="-1" onClick={() => setShowViewModal(false)}>
          <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header d-flex justify-content-between align-items-center">
                <h5 className="modal-title">Full Job Description</h5>
                <FaTimesCircle style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }} onClick={() => setShowViewModal(false)} />
              </div>
              <div className="modal-body">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedJD) }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Role Modal (FULL EDIT) --- */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header d-flex justify-content-between align-items-center">
                <h5 className="modal-title">Edit Role: {editRoleData.role_id}</h5>
                <FaTimesCircle style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }} onClick={() => setShowEditModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Role Name</label>
                  <input type="text" className="form-control" value={editRoleData.role} onChange={(e) => setEditRoleData({...editRoleData, role: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Vacancies</label>
                  <input type="number" className="form-control" value={editRoleData.positions} onChange={(e) => setEditRoleData({...editRoleData, positions: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Job Description</label>
                  <ReactQuill theme="snow" modules={quillModules} formats={quillFormats} value={editRoleData.job_description} onChange={(val) => setEditRoleData({...editRoleData, job_description: val})} style={{ height: '250px', marginBottom: '50px' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveFullRoleUpdate} disabled={isLoading}>{isLoading ? "Saving..." : "Save Changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Add New Role Modal --- */}
      {showAddModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header d-flex justify-content-between align-items-center">
                <h5 className="modal-title">Create New Job Role</h5>
                <FaTimesCircle style={{ cursor: "pointer", fontSize: "22px", color: "#dc3545" }} onClick={() => setShowAddModal(false)} />
              </div>
              <form onSubmit={handleAddRole}>
                <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Role ID (Numeric)</label>
                      <input type="text" className="form-control" required onChange={(e) => setNewRoleData({...newRoleData, role_id: e.target.value})} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Role Name</label>
                      <input type="text" className="form-control" required onChange={(e) => setNewRoleData({...newRoleData, role: e.target.value})} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Vacancies</label>
                      <input type="number" className="form-control" min="1" required onChange={(e) => setNewRoleData({...newRoleData, positions: e.target.value})} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Job Description</label>
                      <ReactQuill theme="snow" modules={quillModules} value={newRoleData.jd_text} onChange={(val) => setNewRoleData({...newRoleData, jd_text: val})} style={{ height: '200px', marginBottom: '50px' }} />
                    </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-success" disabled={isLoading}>{isLoading ? "Saving..." : "Save Role"}</button>
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