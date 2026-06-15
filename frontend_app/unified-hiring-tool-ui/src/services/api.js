import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for the backend URL.
// Set REACT_APP_API_URL in frontend .env — never edit URLs in code again.
// When the ngrok URL changes: update .env, restart `npm start`. Done.
// ─────────────────────────────────────────────────────────────────────────
export const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ngrok's free tier shows a browser warning page unless this header is sent.
// Setting it globally on axios means every page gets it automatically —
// the per-page HEADERS/axiosConfig consts become redundant (but harmless).
// This header is ignored by localhost / real production servers.
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

// Pre-configured instance (optional — raw axios + BASE_URL also works).
export const api = axios.create({ baseURL: BASE_URL });

export const getInterviewers = () => axios.get(`${BASE_URL}/get-interviewers/`);
export const getCandidates = () => axios.get(`${BASE_URL}/get-candidates/`);

// ─────────────────────────────────────────────────────────────────────────
// ATS thresholds — single source of truth for the frontend.
// ATS_REJECT_THRESHOLD is the BUSINESS RULE (reject below this) and MUST
// match the backend's ATS_REJECT_THRESHOLD in backend/.env.
// ATS_TIERS are display-only color/label bands.
// ─────────────────────────────────────────────────────────────────────────
export const ATS_REJECT_THRESHOLD = Number(process.env.REACT_APP_ATS_REJECT_THRESHOLD || 50);

export const ATS_TIERS = {
  strong: 70,   // "Strong Match" label band
  good:   50,   // "Good Match" band
  weak:   30,   // "Moderate" band
  high:   75,   // green badge band in candidate tables
};