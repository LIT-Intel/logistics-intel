import React, { createContext, useContext, useState, ReactNode } from "react";

type AdminModeContextType = {
  isAdminEditMode: boolean;
  setIsAdminEditMode: (enabled: boolean) => void;
  editablePages: Set<string>;
  addEditablePage: (page: string) => void;
  removeEditablePage: (page: string) => void;
  canEditPage: (page: string) => boolean;
};

const AdminModeContext = createContext<AdminModeContextType | undefined>(
  undefined
);

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const [isAdminEditMode, setIsAdminEditMode] = useState(false);
  const [editablePages] = useState<Set<string>>(
    new Set([
      "dashboard",
      "settings",
      "search",
      "billing",
      "account",
      "security",
      "integrations",
      "notifications",
      "access",
    ])
  );

  const addEditablePage = (page: string) => {
    editablePages.add(page);
  };

  const removeEditablePage = (page: string) => {
    editablePages.delete(page);
  };

  const canEditPage = (page: string) => {
    return isAdminEditMode && editablePages.has(page);
  };

  return (
    <AdminModeContext.Provider
      value={{
        isAdminEditMode,
        setIsAdminEditMode,
        editablePages,
        addEditablePage,
        removeEditablePage,
        canEditPage,
      }}
    >
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  const context = useContext(AdminModeContext);
  if (context === undefined) {
    throw new Error("useAdminMode must be used within AdminModeProvider");
  }
  return context;
}
