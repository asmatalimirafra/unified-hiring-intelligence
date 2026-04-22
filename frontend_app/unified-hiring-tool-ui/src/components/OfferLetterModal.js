// src/components/OfferLetterModal.js
import React, { useState } from 'react';
import jsPDF from 'jspdf';
import './OfferLetterModal.css';

const STEPS = { DETAILS: 'details', PREVIEW: 'preview' };

export default function OfferLetterModal({ candidate, roleName, onClose, onOfferGenerated, mode = 'generate', savedDetails = null }) {
  // If mode is 'preview' and we have savedDetails, open directly on preview step
  const [step, setStep] = useState(mode === 'preview' && savedDetails ? STEPS.PREVIEW : STEPS.DETAILS);

  const defaultForm = {
    fixed_ctc: '',
    variable_ctc: '',
    joining_bonus: '',
    joining_date: '',
    designation: roleName || '',
    department: '',
    work_location: '',
    notice_period: '30',
  };

  // Pre-populate form with savedDetails if available (for preview/edit flow)
  const [form, setForm] = useState(savedDetails ? { ...defaultForm, ...savedDetails } : defaultForm);
  const [errors, setErrors] = useState({});
  // Track whether we are in edit mode inside preview (for preview-first flow)
  const [isEditing, setIsEditing] = useState(false);

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  const validate = () => {
    const e = {};
    if (!form.fixed_ctc.trim())   e.fixed_ctc   = 'Fixed CTC is required';
    if (!form.joining_date.trim()) e.joining_date = 'Joining date is required';
    if (!form.designation.trim()) e.designation  = 'Designation is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleProceed = () => {
    if (validate()) setStep(STEPS.PREVIEW);
  };

  const totalCTC = () => {
    const fixed    = parseFloat(form.fixed_ctc)    || 0;
    const variable = parseFloat(form.variable_ctc) || 0;
    const bonus    = parseFloat(form.joining_bonus) || 0;
    return (fixed + variable + bonus).toLocaleString('en-IN');
  };

  const formatJoiningDate = () => {
    if (!form.joining_date) return '—';
    return new Date(form.joining_date).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  };

  // ── Generate PDF ──────────────────────────────────────────────────────────
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, ml = 20, mr = 190, lh = 7;
    let y = 20;

    // Header bar
    doc.setFillColor(15, 40, 80);
    doc.rect(0, 0, W, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('MIRAFRA TECHNOLOGIES', W / 2, 11, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('www.mirafra.com  |  hr@mirafra.com  |  +91-80-1234-5678', W / 2, 15.5, { align: 'center' });

    y = 28;
    // Title
    doc.setTextColor(15, 40, 80);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('OFFER OF EMPLOYMENT', W / 2, y, { align: 'center' });
    y += 2;
    doc.setDrawColor(15, 40, 80);
    doc.setLineWidth(0.6);
    doc.line(ml, y, mr, y);
    y += 7;

    // Date & Ref
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Date: ${today}`, ml, y);
    doc.text(`Ref: MIR/HR/OL/${candidate.candidate_id}`, mr, y, { align: 'right' });
    y += 10;

    // Salutation
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dear ${candidate.name},`, ml, y);
    y += 8;

    // Opening paragraph
    const opening = `We are pleased to extend an offer of employment to you for the position of ${form.designation}${form.department ? ` in the ${form.department} department` : ''} at Mirafra Technologies${form.work_location ? `, ${form.work_location}` : ''}. This offer is made following the successful completion of our selection process and is subject to the terms and conditions outlined below.`;
    const openingLines = doc.splitTextToSize(opening, mr - ml);
    doc.text(openingLines, ml, y);
    y += openingLines.length * lh + 4;

    // Section: Employment Details
    doc.setFillColor(240, 244, 252);
    doc.roundedRect(ml, y, mr - ml, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 40, 80);
    doc.text('EMPLOYMENT DETAILS', ml + 4, y + 5.5);
    y += 13;

    const empDetails = [
      ['Designation',    form.designation],
      ['Department',     form.department   || '—'],
      ['Work Location',  form.work_location || '—'],
      ['Date of Joining', formatJoiningDate()],
      ['Notice Period',  `${form.notice_period} days`],
    ];
    doc.setFontSize(10);
    empDetails.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(`${label}:`, ml + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(value, ml + 55, y);
      y += lh;
    });
    y += 4;

    // Section: Compensation
    doc.setFillColor(240, 244, 252);
    doc.roundedRect(ml, y, mr - ml, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 40, 80);
    doc.text('COMPENSATION & BENEFITS', ml + 4, y + 5.5);
    y += 13;

    const compDetails = [
      ['Fixed CTC (Annual)',    `₹ ${parseFloat(form.fixed_ctc || 0).toLocaleString('en-IN')}`],
      ['Variable CTC (Annual)', form.variable_ctc ? `₹ ${parseFloat(form.variable_ctc).toLocaleString('en-IN')}` : '—'],
      ['Joining Bonus',         form.joining_bonus ? `₹ ${parseFloat(form.joining_bonus).toLocaleString('en-IN')}` : '—'],
      ['Total CTC (Annual)',    `₹ ${totalCTC()}`],
    ];
    doc.setFontSize(10);
    compDetails.forEach(([label, value], idx) => {
      if (idx === compDetails.length - 1) {
        doc.setFillColor(230, 240, 255);
        doc.rect(ml, y - 4, mr - ml, lh + 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 40, 80);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
      }
      doc.text(`${label}:`, ml + 2, y);
      doc.setFont(idx === compDetails.length - 1 ? 'helvetica' : 'helvetica', idx === compDetails.length - 1 ? 'bold' : 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(value, ml + 65, y);
      y += lh;
    });
    y += 5;

    // Terms paragraph
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
    const terms = `This offer is contingent upon successful completion of background verification and submission of all required documents prior to your joining date. You will be required to serve a notice period of ${form.notice_period} days in the event of resignation after joining.\n\nPlease confirm your acceptance of this offer by signing and returning a copy of this letter within 7 days of receipt. Failure to do so may result in the offer being withdrawn.`;
    const termLines = doc.splitTextToSize(terms, mr - ml);
    doc.text(termLines, ml, y);
    y += termLines.length * 5.5 + 8;

    // Closing
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text('We look forward to having you as part of the Mirafra family. Please feel free to reach out', ml, y);
    y += 6;
    doc.text('to us for any queries.', ml, y);
    y += 10;

    // Signatures
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('For Mirafra Technologies', ml, y);
    doc.text('Accepted By', 130, y);
    y += 18;
    doc.setDrawColor(100, 100, 100);
    doc.line(ml, y, ml + 55, y);
    doc.line(130, y, 185, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Authorized Signatory', ml, y);
    doc.text(`${candidate.name}  |  Date: ___________`, 130, y);

    // Footer
    doc.setFillColor(15, 40, 80);
    doc.rect(0, 282, W, 15, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(200, 210, 230);
    doc.text('This is a confidential document intended solely for the named recipient. Mirafra Technologies Pvt. Ltd.', W / 2, 291, { align: 'center' });

    doc.save(`${candidate.name}_Offer_Letter.pdf`);
    // Save offer details to MongoDB so they can be previewed/edited later
    if (onOfferGenerated) onOfferGenerated(candidate.candidate_id, form);
    setIsEditing(false);
  };

  // ── Send to candidate (placeholder) ──────────────────────────────────────
  const handleSend = () => {
    alert(`📧 Email integration coming soon!\nOffer letter will be sent to: ${candidate.email || 'candidate email'}`);
    if (onOfferGenerated) onOfferGenerated(candidate.candidate_id, form);
    setIsEditing(false);
  };

  return (
    <div className="ol-overlay" onClick={onClose}>
      <div className="ol-container" onClick={e => e.stopPropagation()}>

        {/* ── STEP 1: Details Form ────────────────────────────────────────── */}
        {step === STEPS.DETAILS && (
          <>
            <div className="ol-header">
              <div className="ol-header-left">
                <span className="ol-step-tag">{isEditing ? 'Edit Mode' : 'Step 1 of 2'}</span>
                <h2>{isEditing ? 'Edit Offer Letter' : 'Generate Offer Letter'}</h2>
                <p className="ol-sub">
                  {isEditing ? 'Update the details for' : 'Fill in the compensation details for'}{' '}
                  <strong>{candidate.name}</strong>
                </p>
              </div>
              <button className="ol-close" onClick={onClose}>✕</button>
            </div>

            <div className="ol-body">
              <div className="ol-section-title">📋 Role Details</div>
              <div className="ol-grid">
                <div className="ol-field">
                  <label>Designation *</label>
                  <input
                    type="text"
                    value={form.designation}
                    onChange={e => setForm({ ...form, designation: e.target.value })}
                    placeholder="e.g. Senior Software Engineer"
                  />
                  {errors.designation && <span className="ol-error">{errors.designation}</span>}
                </div>
                <div className="ol-field">
                  <label>Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })}
                    placeholder="e.g. Engineering"
                  />
                </div>
                <div className="ol-field">
                  <label>Work Location</label>
                  <input
                    type="text"
                    value={form.work_location}
                    onChange={e => setForm({ ...form, work_location: e.target.value })}
                    placeholder="e.g. Bangalore, Karnataka"
                  />
                </div>
                <div className="ol-field">
                  <label>Joining Date *</label>
                  <input
                    type="date"
                    value={form.joining_date}
                    onChange={e => setForm({ ...form, joining_date: e.target.value })}
                  />
                  {errors.joining_date && <span className="ol-error">{errors.joining_date}</span>}
                </div>
                <div className="ol-field">
                  <label>Notice Period (days)</label>
                  <input
                    type="number"
                    value={form.notice_period}
                    onChange={e => setForm({ ...form, notice_period: e.target.value })}
                    placeholder="30"
                  />
                </div>
              </div>

              <div className="ol-section-title" style={{ marginTop: '1.5rem' }}>💰 Compensation</div>
              <div className="ol-grid">
                <div className="ol-field">
                  <label>Fixed CTC (₹ per annum) *</label>
                  <input
                    type="number"
                    value={form.fixed_ctc}
                    onChange={e => setForm({ ...form, fixed_ctc: e.target.value })}
                    placeholder="e.g. 1200000"
                  />
                  {errors.fixed_ctc && <span className="ol-error">{errors.fixed_ctc}</span>}
                </div>
                <div className="ol-field">
                  <label>Variable CTC (₹ per annum)</label>
                  <input
                    type="number"
                    value={form.variable_ctc}
                    onChange={e => setForm({ ...form, variable_ctc: e.target.value })}
                    placeholder="e.g. 200000"
                  />
                </div>
                <div className="ol-field">
                  <label>Joining Bonus (₹)</label>
                  <input
                    type="number"
                    value={form.joining_bonus}
                    onChange={e => setForm({ ...form, joining_bonus: e.target.value })}
                    placeholder="e.g. 50000"
                  />
                </div>

                {/* Live total preview */}
                {form.fixed_ctc && (
                  <div className="ol-field ol-total-preview">
                    <label>Total CTC</label>
                    <div className="ol-total-value">₹ {totalCTC()}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="ol-footer">
              <button
                className="ol-btn-cancel"
                onClick={() => {
                  if (isEditing) {
                    // Cancel editing → go back to preview without saving changes
                    setForm(savedDetails ? { ...{
                      fixed_ctc: '', variable_ctc: '', joining_bonus: '',
                      joining_date: '', designation: roleName || '',
                      department: '', work_location: '', notice_period: '30',
                    }, ...savedDetails } : {
                      fixed_ctc: '', variable_ctc: '', joining_bonus: '',
                      joining_date: '', designation: roleName || '',
                      department: '', work_location: '', notice_period: '30',
                    });
                    setIsEditing(false);
                    setStep(STEPS.PREVIEW);
                  } else {
                    onClose();
                  }
                }}
              >
                Cancel
              </button>
              <button className="ol-btn-primary" onClick={handleProceed}>
                {isEditing ? 'Preview Updated Letter →' : 'Preview Offer Letter →'}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Preview ─────────────────────────────────────────────── */}
        {step === STEPS.PREVIEW && (
          <>
            <div className="ol-header">
              <div className="ol-header-left">
                <span className="ol-step-tag">{mode === 'preview' ? 'Offer Letter' : 'Step 2 of 2'}</span>
                <h2>Offer Letter Preview</h2>
                <p className="ol-sub">
                  {mode === 'preview'
                    ? <>Previously generated for <strong>{candidate.name}</strong></>
                    : 'Review before downloading or sending'}
                </p>
              </div>
              <button className="ol-close" onClick={onClose}>✕</button>
            </div>

            <div className="ol-body ol-preview-body">
              <div className="ol-letter">

                {/* Letter Header */}
                <div className="ol-letter-header">
                  <div className="ol-company-name">MIRAFRA TECHNOLOGIES</div>
                  <div className="ol-company-meta">www.mirafra.com  ·  hr@mirafra.com  ·  +91-80-1234-5678</div>
                </div>

                <div className="ol-letter-body">
                  <div className="ol-letter-title">OFFER OF EMPLOYMENT</div>

                  <div className="ol-letter-meta">
                    <span>Date: {today}</span>
                    <span>Ref: MIR/HR/OL/{candidate.candidate_id}</span>
                  </div>

                  <p className="ol-salutation">Dear {candidate.name},</p>

                  <p className="ol-para">
                    We are pleased to extend an offer of employment to you for the position of{' '}
                    <strong>{form.designation}</strong>
                    {form.department && <> in the <strong>{form.department}</strong> department</>}
                    {' '}at Mirafra Technologies{form.work_location && <>, <strong>{form.work_location}</strong></>}.
                    This offer is made following the successful completion of our selection process.
                  </p>

                  {/* Employment Details */}
                  <div className="ol-details-section">
                    <div className="ol-details-heading">EMPLOYMENT DETAILS</div>
                    <table className="ol-details-table">
                      <tbody>
                        <tr><td>Designation</td><td>{form.designation}</td></tr>
                        <tr><td>Department</td><td>{form.department || '—'}</td></tr>
                        <tr><td>Work Location</td><td>{form.work_location || '—'}</td></tr>
                        <tr><td>Date of Joining</td><td>{formatJoiningDate()}</td></tr>
                        <tr><td>Notice Period</td><td>{form.notice_period} days</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Compensation */}
                  <div className="ol-details-section">
                    <div className="ol-details-heading">COMPENSATION & BENEFITS</div>
                    <table className="ol-details-table">
                      <tbody>
                        <tr>
                          <td>Fixed CTC (Annual)</td>
                          <td>₹ {parseFloat(form.fixed_ctc || 0).toLocaleString('en-IN')}</td>
                        </tr>
                        <tr>
                          <td>Variable CTC (Annual)</td>
                          <td>{form.variable_ctc ? `₹ ${parseFloat(form.variable_ctc).toLocaleString('en-IN')}` : '—'}</td>
                        </tr>
                        <tr>
                          <td>Joining Bonus</td>
                          <td>{form.joining_bonus ? `₹ ${parseFloat(form.joining_bonus).toLocaleString('en-IN')}` : '—'}</td>
                        </tr>
                        <tr className="ol-total-row">
                          <td><strong>Total CTC (Annual)</strong></td>
                          <td><strong>₹ {totalCTC()}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="ol-para">
                    This offer is contingent upon successful completion of background verification and
                    submission of all required documents prior to your joining date. You will be required
                    to serve a notice period of <strong>{form.notice_period} days</strong> in the event
                    of resignation after joining.
                  </p>

                  <p className="ol-para">
                    Please confirm your acceptance of this offer by signing and returning a copy of this
                    letter within <strong>7 days</strong> of receipt.
                  </p>

                  <p className="ol-para">
                    We look forward to welcoming you to the Mirafra family!
                  </p>

                  {/* Signature block */}
                  <div className="ol-signature-block">
                    <div className="ol-sig">
                      <div className="ol-sig-line"></div>
                      <div className="ol-sig-label">Authorized Signatory</div>
                      <div className="ol-sig-sub">Mirafra Technologies</div>
                    </div>
                    <div className="ol-sig">
                      <div className="ol-sig-line"></div>
                      <div className="ol-sig-label">{candidate.name}</div>
                      <div className="ol-sig-sub">Candidate Signature & Date</div>
                    </div>
                  </div>
                </div>

                <div className="ol-letter-footer">
                  This is a confidential document intended solely for the named recipient · Mirafra Technologies Pvt. Ltd.
                </div>
              </div>
            </div>

            <div className="ol-footer">
              {/* Left side: Cancel (always closes modal) */}
              <button className="ol-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <div className="ol-footer-right">
                {/* Edit button — switches to details form in edit mode */}
                <button
                  className="ol-btn-back"
                  onClick={() => { setIsEditing(true); setStep(STEPS.DETAILS); }}
                >
                  ✏️ Edit
                </button>
                <button className="ol-btn-send" onClick={handleSend}>
                  📧 Send to Candidate
                </button>
                <button className="ol-btn-primary" onClick={handleDownloadPDF}>
                  ⬇ Download PDF
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}