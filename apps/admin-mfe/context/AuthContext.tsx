"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { api } from '@/lib/api';

export type UserRole = 'ADMIN_SUPER' | 'ADMIN_CREATOR' | 'ADMIN_ASSIGNER' | 'COMPANY_SUPER' | 'COMPANY_MANAGER' | 'COMPANY_VIEWER' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  role: UserRole;
  permissions: string[];
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
    localStorage.getItem('admin_role'),
    localStorage.getItem('permissions'),
  ]);
const getServerSnapshot = () => null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isLoading = snapshot === null;
  const { isAuthenticated, role, permissions } = useMemo(() => {
    if (!snapshot) return { isAuthenticated: false, role: null as UserRole, permissions: [] as string[] };
    const [token, savedRole, savedPermissions] = JSON.parse(snapshot) as (string | null)[];
    let perms: string[] = [];
    try { perms = JSON.parse(savedPermissions || '[]'); } catch { perms = []; }
    const authed = Boolean(token && savedRole);
    return {
      isAuthenticated: authed,
      role: (authed ? savedRole : null) as UserRole,
      permissions: authed ? perms : [],
    };
  }, [snapshot]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login' && pathname !== '/signup') {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await api.post('/api/v1/auth/authenticate', { username, password });
      const token = res.data.token;
      if (token) {
        const decoded: any = jwtDecode(token);
        const assignedRole: UserRole = decoded.role || null;
        const assignedPermissions: string[] = decoded.permissions || [];

        localStorage.setItem('token', token);
        localStorage.setItem('admin_role', assignedRole as string);
        localStorage.setItem('permissions', JSON.stringify(assignedPermissions));
        window.dispatchEvent(new Event(AUTH_EVENT));
        router.push('/');
        return true;
      }
    } catch (e) {
      console.error("Login failed: ", e);
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('permissions');
    window.dispatchEvent(new Event(AUTH_EVENT));
    router.push('/login');
  };

  const hasPermission = (permission: string) => permissions.includes(permission);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, permissions, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
