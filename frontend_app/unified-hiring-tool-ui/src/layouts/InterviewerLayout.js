import React from "react";
import InterviewerNavbar from "../components/InterviewerNavbar";
import { Outlet } from "react-router-dom";

export default function InterviewerLayout() {
  return (
    <>
      <InterviewerNavbar />
      <div className="full-screen-wrapper">
        <Outlet />
      </div>
    </>
  );
}