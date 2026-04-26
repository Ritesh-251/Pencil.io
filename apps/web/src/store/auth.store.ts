import { create } from 'zustand';

interface AuthState {
  user: { id: string; username: string; email: string; isVerified?: boolean } | null;
  token: string | null;
  setAuth: (user: any, token: string) => void;
  updateUser: (data: Partial<NonNullable<AuthState['user']>>) => void;
  logout: () => void;
}

const getInitialAuthState = () => {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }

  const storedUser = localStorage.getItem('user');
  const storedToken = localStorage.getItem('token');

  let user: AuthState['user'] = null;
  if (storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
    try {
      user = JSON.parse(storedUser);
    } catch {
      localStorage.removeItem('user');
    }
  }

  const token = storedToken && storedToken !== 'undefined' ? storedToken : null;
  if (storedToken === 'undefined') {
    localStorage.removeItem('token');
  }

  return { user, token };
};

const initialAuthState = getInitialAuthState();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialAuthState.user,
  token: initialAuthState.token,
  setAuth: (user, token) => {
    if (typeof window === 'undefined' || !token || token === 'undefined') {
      return;
    }
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    document.cookie = `has_session=true; path=/; max-age=604800`;
    set({ user, token });
  },
  updateUser: (data) => {
    const user = get().user;
    if (!user) return;
    const newUser = { ...user, ...data };
    localStorage.setItem('user', JSON.stringify(newUser));
    set({ user: newUser });
  },
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    document.cookie = `has_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    set({ user: null, token: null });
    window.location.href = '/auth/signin';
  }
}));

interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected';
  syncing: boolean;
  setStatus: (s: 'connecting' | 'connected' | 'disconnected') => void;
  setSyncing: (s: boolean) => void;
}
export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  syncing: false,
  setStatus: (status) => set({ status }),
  setSyncing: (syncing) => set({ syncing }),
}));
