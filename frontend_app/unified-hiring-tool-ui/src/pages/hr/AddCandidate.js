// src/pages/hr/AddCandidate.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AddCandidate.css';
import { FaCheckCircle } from 'react-icons/fa';

// const BASE_URL = 'http://localhost:8080';
const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

export default function AddCandidate() {
  const [roles, setRoles] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    applied_role: '',
    email: '',
    phone: '',
    github: '',
    location: '',
    resume_file: null,
  });
  const [candidateId, setCandidateId] = useState('');
  const [addedOn,     setAddedOn]     = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('');
  const [step, setStep] = useState(1);

  // useEffect(() => {
  //   const fetchRoles = async () => {
  //     try {
  //       const res = await axios.get(`${BASE_URL}/get-roles/`);
  //       setRoles(res.data.filter((r) => r.status === 'open'));
  //     } catch (err) {
  //       console.error('❌ Failed to fetch roles', err);
  //     }
  //   };
  //   fetchRoles();
  // }, []);
useEffect(() => {

  const fetchRoles = async () => {

    try {

      const res = await axios.get(`${BASE_URL}/get-roles/`, {
        headers: {
          "ngrok-skip-browser-warning": "true"
        }
      });

      console.log("Roles API response:", res.data);

      if (Array.isArray(res.data)) {

        const openRoles = res.data.filter(
          (r) => r.status?.toLowerCase().trim() === "open"
        );

        setRoles(openRoles);

      } else {

        console.error("Roles API did not return array:", res.data);

      }

    } catch (err) {

      console.error("❌ Failed to fetch roles", err);

    }

  };

  fetchRoles();

}, []);
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const allowedExtensions = ['.pdf', '.docx'];
      
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        setStatusType('error');
        setStatusMsg('Please upload only PDF or DOCX files.');
        return;
      }
      
      // Clear any previous error messages
      setStatusMsg('');
      setStatusType('');
    }
    
    setFormData({ ...formData, resume_file: file });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      setStatusType('error');
      setStatusMsg('Please enter candidate name.');
      return;
    }
    
    if (!formData.applied_role) {
      setStatusType('error');
      setStatusMsg('Please select an applied role.');
      return;
    }
    
    if (!formData.resume_file) {
      setStatusType('error');
      setStatusMsg('Please upload a resume file.');
      return;
    }

    setLoading(true);
    setStatusMsg('Extracting details from resume...');
    setStatusType('info');

    try {
      // Create FormData - this is the key fix
      const data = new FormData();
      data.append('name', formData.name.trim());
      data.append('applied_role', formData.applied_role);
      
      // ✅ FIXED: Append the original file directly (no conversion needed)
      data.append('resume_file', formData.resume_file);

      console.log('📤 Uploading candidate data:', {
        name: formData.name,
        applied_role: formData.applied_role,
        fileName: formData.resume_file.name,
        fileSize: formData.resume_file.size,
        fileType: formData.resume_file.type
      });

      // const res = await axios.post(`${BASE_URL}/add-candidate/`, data, {
      //   headers: { 
      //     'Content-Type': 'multipart/form-data'
      //   },
      //   timeout: 30000 // 30 second timeout for large files
      // });
const res = await axios.post(`${BASE_URL}/add-candidate/`, data, {
  headers: {
    "Content-Type": "multipart/form-data",
    "ngrok-skip-browser-warning": "true"
  },
  timeout: 30000
});
      
      const added = res.data;
      console.log('✅ Candidate added successfully:', added);
      setCandidateId(added.candidate_id);
      setAddedOn(new Date().toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }));

      // Fetch the updated candidate details
      setStatusMsg('Fetching extracted details...');
      // const allCandidates = await axios.get(`${BASE_URL}/get-candidates/`);
      const allCandidates = await axios.get(`${BASE_URL}/get-candidates/`, {
  headers: {
    "ngrok-skip-browser-warning": "true"
  }
});
      const newCandidate = allCandidates.data.find(
        (c) => c.candidate_id === added.candidate_id
      );

      if (newCandidate) {
        setFormData((prev) => ({
          ...prev,
          email: newCandidate.email || '',
          phone: newCandidate.phone || '',
          github: newCandidate.github || '',
          location: newCandidate.location || '',
        }));
        
        setStatusType('success');
        setStatusMsg('✅ Resume processed successfully! Please review the extracted details.');
      }

      setStep(2);
    } catch (err) {
      console.error('❌ Upload error:', err);
      
      let errorMessage = '❌ Upload failed. Please try again.';
      
      if (err.response) {
        // Server responded with error status
        switch (err.response.status) {
          case 400:
            errorMessage = err.response.data?.detail || '❌ Invalid file format. Please upload PDF or DOCX files only.';
            break;
          case 404:
            errorMessage = '❌ Selected role not found. Please refresh and try again.';
            break;
          case 409:
            errorMessage = '❌ Candidate already exists with this information.';
            break;
          case 413:
            errorMessage = '❌ File too large. Please upload a smaller file.';
            break;
          case 500:
            errorMessage = '❌ Server error. Please try again later.';
            break;
          default:
            errorMessage = `❌ Upload failed: ${err.response.data?.detail || err.response.statusText}`;
        }
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = '❌ Upload timeout. Please try with a smaller file or check your connection.';
      } else if (err.message.includes('Network Error')) {
        errorMessage = '❌ Network error. Please check your connection and try again.';
      }
      
      setStatusType('error');
      setStatusMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!candidateId) return;
    
    setLoading(true);
    setStatusMsg('Updating candidate...');
    setStatusType('info');
    
    try {
      await axios.put(`${BASE_URL}/update-candidate/${candidateId}`, {
        name: formData.name.trim(),
        applied_role: formData.applied_role,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        github: formData.github.trim(),
        location: formData.location.trim(),
      });
      
      setStatusType('success');
      setStatusMsg('✅ Candidate updated successfully!');
    } catch (err) {
      console.error('❌ Update error:', err);
      setStatusType('error');
      setStatusMsg('❌ Failed to update candidate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!candidateId) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete candidate "${formData.name}"?\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    setLoading(true);
    setStatusMsg('Deleting candidate...');
    setStatusType('info');
    
    try {
      await axios.delete(`${BASE_URL}/delete-candidate/${candidateId}`);
      
      setStatusType('success');
      setStatusMsg('🗑 Candidate deleted successfully.');
      
      // Reset form
      setTimeout(() => {
        setStep(1);
        setFormData({
          name: '',
          applied_role: '',
          email: '',
          phone: '',
          github: '',
          location: '',
          resume_file: null,
        });
        setCandidateId('');
        setAddedOn('');
        setStatusMsg('');
        setStatusType('');
      }, 2000);
      
    } catch (err) {
      console.error('❌ Delete error:', err);
      setStatusType('error');
      setStatusMsg('❌ Failed to delete candidate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndExit = () => {
    if (window.confirm('Are you sure you want to save and exit? Any unsaved changes will be lost.')) {
      window.location.reload();
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset the form? All entered data will be lost.')) {
      setStep(1);
      setFormData({
        name: '',
        applied_role: '',
        email: '',
        phone: '',
        github: '',
        location: '',
        resume_file: null,
      });
      setCandidateId('');
      setAddedOn('');
      setStatusMsg('');
      setStatusType('');
    }
  };

  return (
    <div className="add-candidate-container">
      <h2>Add New Candidate</h2>

      {step === 1 && (
        <form onSubmit={handleUpload} className="upload-form">
          <div className="form-group">
            <label htmlFor="name">Candidate Name *</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Enter candidate's full name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Applied Role *</label>
            <select
              id="role"
              value={formData.applied_role}
              onChange={(e) =>
                setFormData({ ...formData, applied_role: e.target.value })
              }
              required
            >
              <option value="">-- Select Role --</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role}>
                  {role.role} ({role.role_id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="resume">Upload Resume * (PDF or DOCX only)</label>
            <input
              id="resume"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              required
            />
            {formData.resume_file && (
              <div className="file-info">
                <small>Selected: {formData.resume_file.name} ({(formData.resume_file.size / 1024 / 1024).toFixed(2)} MB)</small>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-upload" disabled={loading}>
              {loading ? 'Processing Resume...' : 'Upload & Process Resume'}
            </button>
            <button type="button" className="btn-reset" onClick={handleReset} disabled={loading}>
              Reset Form
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="review-form">
          <h3>Review & Edit Candidate Details</h3>
          <p className="review-note">Please review the extracted information and make any necessary corrections:</p>
          {addedOn && (
            <div className="timestamp-badge">
              🕐 Added on: <strong>{addedOn}</strong>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="review-name">Name *</label>
            <input
              id="review-name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-role">Applied Role *</label>
            <select
              id="review-role"
              value={formData.applied_role}
              onChange={(e) =>
                setFormData({ ...formData, applied_role: e.target.value })
              }
              required
            >
              {roles.map((role) => (
                <option key={role.role_id} value={role.role}>
                  {role.role} ({role.role_id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="review-email">Email</label>
            <input
              id="review-email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="candidate@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-phone">Phone</label>
            <input
              id="review-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-github">GitHub Profile</label>
            <input
              id="review-github"
              type="url"
              value={formData.github}
              onChange={(e) =>
                setFormData({ ...formData, github: e.target.value })
              }
              placeholder="https://github.com/username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-location">Location</label>
            <input
              id="review-location"
              type="text"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              placeholder="City, State, Country"
            />
          </div>

          <div className="action-buttons">
            <button className="btn-exit" onClick={handleSaveAndExit} disabled={loading}>
              <FaCheckCircle /> Save & Exit
            </button>
            <button className="btn-delete" onClick={handleReset} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={`status-msg ${statusType}`}>
          {statusMsg}
        </div>
      )}
    </div>
  );
}