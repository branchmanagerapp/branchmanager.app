import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { signIn, signOut, getSession, quickLogin, type UserSession } from '../api/auth';
import { can } from '../utils/permissions';
import type { RoleKey, PermissionKey } from '../models/types';

interface AuthState {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  demoLogin: (role: RoleKey) => Promise<void>;
  hasPermission: (perm: PermissionKey) => boolean;
  isOwner: boolean;
  isCrewLead: boolean;
}

export function useAuthState(): AuthState {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then(s => {
      setUser(s);
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await signIn(email, password);
    setUser(session);
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  const demoLogin = useCallback(async (role: RoleKey) => {
    const session = await quickLogin(role);
    setUser(session);
  }, []);

  const hasPermission = useCallback((perm: PermissionKey) => {
    if (!user) return false;
    return can(user.role, perm);
  }, [user]);

  return {
    user,
    loading,
    login,
    logout,
    demoLogin,
    hasPermission,
    isOwner: user?.role === 'owner' || user?.role === 'super_admin',
    isCrewLead: user?.role === 'owner' || user?.role === 'crew_lead' || user?.role === 'super_admin',
  };
}

// Context for providing auth across the app
export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  demoLogin: async () => {},
  hasPermission: () => false,
  isOwner: false,
  isCrewLead: false,
});

export const useAuth = () => useContext(AuthContext);
