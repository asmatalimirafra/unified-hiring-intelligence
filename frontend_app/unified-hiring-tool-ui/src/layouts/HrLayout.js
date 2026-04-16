import React from 'react';
import HrNavbar from '../components/HrNavbar';
import { Outlet } from 'react-router-dom';
import './HrLayout.css';

export default function HrLayout() {
  return (
    <>
      <HrNavbar />
      <div className="full-screen-wrapper">
        <Outlet />
      </div>
    </>
  );
}