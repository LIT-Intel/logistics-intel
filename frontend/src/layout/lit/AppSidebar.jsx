import React from "react";

const AppSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <aside className="hidden md:flex md:w-[270px] md:flex-col border-r bg-white">
      <div className="p-5 font-semibold">LIT Sidebar Test</div>
    </aside>
  );
};

export default AppSidebar;
