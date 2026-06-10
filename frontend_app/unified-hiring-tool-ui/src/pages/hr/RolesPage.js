import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './RolesPage.css';
import { FaEye, FaEdit, FaTrashAlt, FaTimesCircle, FaUndo } from 'react-icons/fa';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { BASE_URL } from '../../services/api';


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

// ── Toast Component ───────────────────────────────────────────────────────────
// Appears top-right, auto-dismisses after 3.5s.
// type: 'success' | 'error'
function Toast({ toasts }) {
  return (
    <div className="rp-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`rp-toast rp-toast--${t.type}`}>
          <span className="rp-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="rp-toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
// Replaces window.confirm — shows a centered modal with Yes/Cancel buttons.
function ConfirmDialog({ config, onConfirm, onCancel }) {
  if (!config) return null;
  return (
    <div className="rp-confirm-overlay" onClick={onCancel}>
      <div className="rp-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="rp-confirm-icon">{config.icon || '❓'}</div>
        <h4 className="rp-confirm-title">{config.title}</h4>
        <p className="rp-confirm-msg">{config.message}</p>
        <div className="rp-confirm-actions">
          <button className="rp-confirm-btn rp-confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`rp-confirm-btn rp-confirm-btn--ok rp-confirm-btn--${config.variant || 'danger'}`}
            onClick={onConfirm}
          >
            {config.confirmLabel || 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesPage() {
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [openRoles, setOpenRoles]     = useState([]);
  const [closedRoles, setClosedRoles] = useState([]);
  const [selectedJD, setSelectedJD]   = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab]     = useState('open');

  const [editVacancyData, setEditVacancyData] = useState({
    role_id: '', role: '', positions: 0, jd_text: ''
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [newRoleData, setNewRoleData]   = useState({ role: '', positions: 1, jd_text: '' });
  const [submitting, setSubmitting]     = useState(false);
<<<<<<< HEAD

  // ── Toast state ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Confirm dialog state ─────────────────────────────────────────────────────
  const [confirmConfig, setConfirmConfig]   = useState(null);
  const [confirmCallback, setConfirmCallback] = useState(null);

  // Ask a yes/no question — returns a promise that resolves true/false
  const askConfirm = (config) =>
    new Promise((resolve) => {
      setConfirmConfig(config);
      setConfirmCallback(() => resolve);
    });

  const handleConfirmYes = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(true);
    setConfirmCallback(null);
  };

  const handleConfirmNo = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(false);
    setConfirmCallback(null);
  };
=======
>>>>>>> b03856d (Remove hardcoded config: centralize in config.py + env vars)

  // ── Toast state ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);

<<<<<<< HEAD
=======
  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Confirm dialog state ─────────────────────────────────────────────────────
  const [confirmConfig, setConfirmConfig]   = useState(null);
  const [confirmCallback, setConfirmCallback] = useState(null);

  // Ask a yes/no question — returns a promise that resolves true/false
  const askConfirm = (config) =>
    new Promise((resolve) => {
      setConfirmConfig(config);
      setConfirmCallback(() => resolve);
    });

  const handleConfirmYes = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(true);
    setConfirmCallback(null);
  };

  const handleConfirmNo = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(false);
    setConfirmCallback(null);
  };

  // const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

>>>>>>> b03856d (Remove hardcoded config: centralize in config.py + env vars)
  useEffect(() => { fetchRoles(); }, []); // eslint-disable-line

  const fetchRoles = async () => {
    try {
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
      showToast('Failed to fetch roles. Check your connection.', 'error');
    }
  };

  const handleViewJD = (jdText) => {
    setSelectedJD(jdText);
    setShowModal(true);
  };

  const handleClose = async (role_id) => {
    const yes = await askConfirm({
      icon: '📁',
      title: 'Close this position?',
      message: 'This role will be moved to Closed Positions. Candidates already in the pipeline will not be affected.',
      confirmLabel: 'Yes, Close',
      variant: 'warning'
    });
    if (!yes) return;
    try {
      await axios.post(`${BASE_URL}/close-role/${role_id}`, {}, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      fetchRoles();
      showToast('Role closed successfully.');
    } catch (err) {
      console.error('Error closing role:', err);
      const msg = err.response?.data?.detail || 'Failed to close role. Please check the backend connection.';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (role_id) => {
    const yes = await askConfirm({
      icon: '🗑️',
      title: 'Delete this role?',
      message: 'This action is permanent and cannot be undone. The role and its JD will be removed.',
      confirmLabel: 'Yes, Delete',
      variant: 'danger'
    });
    if (!yes) return;
    try {
      await axios.delete(`${BASE_URL}/delete-role/${role_id}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      fetchRoles();
      showToast('Role deleted successfully.');
    } catch (err) {
      console.error('Error deleting role:', err);
      const msg = err.response?.data?.detail || 'Failed to delete role. Please try again.';
      showToast(msg, 'error');
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
      }, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      setShowEditModal(false);
      fetchRoles();
      showToast('Role updated successfully.');
    } catch (err) {
      console.error('Failed to update role:', err);
      const msg = err.response?.data?.detail || 'Failed to update role. Please check the backend connection.';
      showToast(msg, 'error');
    }
  };

  const handleReopenRole = async (roleId) => {
    const yes = await askConfirm({
      icon: '📂',
      title: 'Reopen this position?',
      message: 'This role will be moved back to Open Positions and become available for new candidates.',
      confirmLabel: 'Yes, Reopen',
      variant: 'success'
    });
    if (!yes) return;
    try {
      await axios.put(`${BASE_URL}/update-role/${roleId}`, { status: 'open' }, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      fetchRoles();
      showToast('Role reopened successfully.');
    } catch (err) {
      console.error('Failed to reopen role:', err);
      const msg = err.response?.data?.detail || 'Failed to reopen role.';
      showToast(msg, 'error');
    }
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData();
    formData.append('role', newRoleData.role);
    formData.append('positions', newRoleData.positions);
    formData.append('jd_text', newRoleData.jd_text);
    if (hrId) formData.append('hr_id', hrId);

    try {
      const res = await axios.post(`${BASE_URL}/add-role/`, formData, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const newId = res.data?.role_id;
      setShowAddModal(false);
      setNewRoleData({ role: '', positions: 1, jd_text: '' });
      setActiveTab('open');
      fetchRoles();
      showToast(`Role added successfully! Role ID: ${newId}`);
    } catch (err) {
      console.error('Error adding role:', err);
      const msg = err.response?.data?.detail || 'Failed to add role. Check console for details.';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Vacancy cell ─────────────────────────────────────────────────────────────
  const renderVacancies = (role) => {
    const total    = role.positions ?? 0;
    const left     = role.vacancies_left !== undefined ? role.vacancies_left : total;
    const allFilled = left === 0 && total > 0;
    return (
      <span
        className={allFilled ? 'badge bg-danger' : 'badge bg-success'}
        title={`${left} vacancy/vacancies remaining out of ${total} total`}
        style={{ fontSize: '0.85rem' }}
      >
        {left} / {total}
      </span>
    );
  };

  // ── Created / Last edited cell ────────────────────────────────────────────
  const renderCreatedAndEdited = (role) => (
    <div style={{ fontSize: '0.8rem', lineHeight: '1.35' }}>
      <div>
        <span style={{ color: '#888' }}>Created:</span><br />
        {formatTimestamp(role.created_at)}
      </div>
      <div style={{ marginTop: '4px' }}>
        <span style={{ color: '#888' }}>Last edited:</span><br />
        {formatTimestamp(role.last_edited_at || role.created_at)}
      </div>
    </div>
  );

  const renderTable = (roles, isClosed = false) => (
    roles.length === 0 ? (
      <p className="empty-message text-muted" style={{ padding: '1rem 0' }}>
        {isClosed
          ? 'No closed positions yet.'
          : 'No open positions. Click "+ Add New Role" to create one.'}
      </p>
    ) : (
      <table className="table table-bordered mt-3">
        <thead className="table-light">
          <tr>
            <th>Role ID</th>
            <th>Position</th>
            <th>Job Description</th>
            <th>Vacancies (left / total)</th>
            <th>{isClosed ? 'Closed On' : 'Created / Last edited'}</th>
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

              <td style={{ textAlign: 'center' }}>
                {renderVacancies(role)}
              </td>

              <td>
                {isClosed
                  ? formatTimestamp(role.closed_on)
                  : renderCreatedAndEdited(role)}
              </td>

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
    )
  );

  const TABS = [
    { key: 'open',   icon: '📂', label: 'Open Positions',   count: openRoles.length,   render: () => renderTable(openRoles, false) },
    { key: 'closed', icon: '📁', label: 'Closed Positions', count: closedRoles.length, render: () => renderTable(closedRoles, true) },
  ];

  const currentTab = TABS.find(t => t.key === activeTab) || TABS[0];

  return (
    <div className="page-wrapper">

      {/* ── Toast notifications (top-right) ──────────────────────────────── */}
      <Toast toasts={toasts} />

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      <ConfirmDialog
        config={confirmConfig}
        onConfirm={handleConfirmYes}
        onCancel={handleConfirmNo}
      />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Role Management</h1>
        <button className="btn btn-success" onClick={() => setShowAddModal(true)}>
          + Add New Role
        </button>
      </div>

      <div className="roles-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`roles-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className="roles-tab-icon">{t.icon}</span>
            <span className="roles-tab-label">{t.label}</span>
            <span className="roles-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="roles-section">
        <h4>{currentTab.icon} {currentTab.label}</h4>
        {currentTab.render()}
      </div>

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
                  onClick={() => setShowAddModal(false)}
                />
              </div>
              <form onSubmit={handleAddRole}>
                <div className="modal-body">
                  <div
                    className="mb-3 p-2"
                    style={{
                      background: '#f1f8ff',
                      border: '1px solid #d0e2ff',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      color: '#555'
                    }}
                  >
                    ℹ️ Role ID will be assigned automatically.
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Role Name</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={newRoleData.role}
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
                      value={newRoleData.positions}
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
                    onClick={() => setShowAddModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Save Role'}
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
