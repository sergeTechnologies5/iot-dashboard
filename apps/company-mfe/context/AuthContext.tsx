"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { api } from '@/lib/api';

export type CompanyRole = 'COMPANY_VIEWER' | 'COMPANY_MANAGER' | 'COMPANY_SUPER' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  role: CompanyRole;
  companyId: string | null;
  isLoading: boolean;
  login: (u: string, p: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const AUTH_EVENT = 'auth-change';

// localStorage-backed external store (null snapshot on the server => loading)
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(AUTH_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(AUTH_EVENT, callback);
  };
}
const getSnapshot = () =>
  JSON.stringify([
    localStorage.getItem('token'),
    localStorage.getItem('company_role'),
    localStorage.getItem('company_id'),
    localStorage.getItem('permissions'),
  ]);
const getServerSnapshot = () => null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isLoading = snapshot === null;
  const { isAuthenticated, role, companyId, permissions } = useMemo(() => {
    if (!snapshot) return { isAuthenticated: false, role: null as CompanyRole, companyId: null as string | null, permissions: [] as string[] };
    const [token, savedRole, savedCompId, savedPermissions] = JSON.parse(snapshot) as (string | null)[];
    let perms: string[] = [];
    try { perms = JSON.parse(savedPermissions || '[]'); } catch { perms = []; }
    const authed = Boolean(token && savedRole);
    return {
      isAuthenticated: authed,
      role: (authed ? savedRole : null) as CompanyRole,
      companyId: authed ? savedCompId : null,
      permissions: authed ? perms : [],
    };
  }, [snapshot]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await api.post('/api/v1/auth/authenticate', { username, password });
      const token = res.data.token;
      if (token) {
        const decoded: any = jwtDecode(token);
        const assignedRole: CompanyRole = decoded.role || null;
        const assignedPermissions: string[] = decoded.permissions || [];
        const compId: string | null = decoded.companyId ? String(decoded.companyId) : null;

        localStorage.setItem('token', token);
        localStorage.setItem('company_role', assignedRole as string);
        localStorage.setItem('permissions', JSON.stringify(assignedPermissions));
        if (compId) localStorage.setItem('company_id', compId);
        else localStorage.removeItem('company_id');
        window.dispatchEvent(new Event(AUTH_EVENT));
        router.push('/');
        return true;
      }
    } catch (e) {
      console.error("Login failed: ", e);
    }
    return false;
  };

  const hasPermission = (permission: string) => permissions.includes(permission);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('company_role');
    localStorage.removeItem('company_id');
    localStorage.removeItem('permissions');
    window.dispatchEvent(new Event(AUTH_EVENT));
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, companyId, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
