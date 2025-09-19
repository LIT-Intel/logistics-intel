import React, { useEffect } from "react";
import CustomLoginPage from "@/components/layout/CustomLoginPage";

export default function Login() {
  // render the modal as a full page
  useEffect(() => {
    document.title = "Log in — Logistic Intel";
  }, []);
  return (
    <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-4">
      <CustomLoginPage onClose={() => (window.location.href = "/")} />
    </div>
  );
}
