import React from 'react';
import './ResumeViewer.css';
import { BASE_URL } from '../services/api';


// const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

function ResumeViewer({ candidateId, fileName, onClose }) {
  // ✅ FIX: Use a template string and add the ngrok bypass as a query parameter
  // We don't use the 'headers' object here because iframes/links can't read them.
  const resumeURL = `${BASE_URL}/get-resume/${candidateId}?ngrok-skip-browser-warning=true`;

  return (
    <div className="modal-backdrop">
      <div className="modal-content-large">
        <div className="modal-header">
          <h3>{fileName || 'Resume'}</h3>
          <div className="modal-actions">
            <a
              href={resumeURL}
              target="_blank"
              rel="noreferrer"
              className="open-tab-btn"
            >
              Open in New Tab
            </a>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body" style={{ height: '80vh' }}>
            <iframe
              src={resumeURL}
              width="100%"
              height="100%"
              title="Resume PDF"
              style={{ border: 'none' }}
            />
        </div>
      </div>
    </div>
  );
}

export default ResumeViewer;