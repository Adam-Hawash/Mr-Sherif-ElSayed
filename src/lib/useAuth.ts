"use client";

import { useState, useEffect } from "react";

export interface CurrentStudent {
  id: string;
  name: string;
  phone: string;
  grade: string;
  status: string;
  isPaidAccess: boolean;
}

export interface CurrentAdmin {
  id: string;
  email: string;
  name: string;
}

export function useAuth() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedStudent = localStorage.getItem("mg_student");
      const storedAdmin = localStorage.getItem("mg_admin");

      if (storedStudent) {
        setStudent(JSON.parse(storedStudent));
      }
      if (storedAdmin) {
        setAdmin(JSON.parse(storedAdmin));
      }
    } catch (e) {
      console.error("Failed to parse auth", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginStudent = (data: CurrentStudent) => {
    localStorage.setItem("mg_student", JSON.stringify(data));
    localStorage.removeItem("mg_admin");
    setStudent(data);
    setAdmin(null);
  };

  const loginAdmin = (data: CurrentAdmin) => {
    localStorage.setItem("mg_admin", JSON.stringify(data));
    localStorage.removeItem("mg_student");
    setAdmin(data);
    setStudent(null);
  };

  const logout = () => {
    localStorage.removeItem("mg_student");
    localStorage.removeItem("mg_admin");
    setStudent(null);
    setAdmin(null);
    window.location.href = "/";
  };

  const refreshStudent = async () => {
    if (!student?.id) return;
    try {
      const res = await fetch(`/api/students/${student.id}`);
      if (res.ok) {
        const data = await res.json();
        setStudent(data);
        localStorage.setItem("mg_student", JSON.stringify(data));
      }
    } catch (e) {
      console.error("Refresh student failed", e);
    }
  };

  return {
    student,
    admin,
    loading,
    loginStudent,
    loginAdmin,
    logout,
    refreshStudent,
    isStudent: !!student,
    isAdmin: !!admin,
  };
}
