"use client";

import { createContext, useContext } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "./store";

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  token: null,
});

export function useAuth(): AuthContextType {
  const token = useSelector((s: RootState) => s.auth.token);
  return {
    isAuthenticated: !!token,
    token,
  };
}

export default AuthContext;
