import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      currentLocation: null,
      currentShift: null,

      login: async (employeeCode, password) => {
        try {
          const response = await api.post('/auth/login', { employeeCode, password });
          const { user, accessToken, refreshToken } = response.data;
          
          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            currentLocation: user.locationId ? {
              id: user.locationId,
              name: user.locationName,
            } : null,
          });
          
          // Set token in API client
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          
          return { success: true };
        } catch (error) {
          return { 
            success: false, 
            error: error.response?.data?.message || 'Login failed' 
          };
        }
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          currentLocation: null,
          currentShift: null,
        });
        delete api.defaults.headers.common['Authorization'];
      },

      refreshAccessToken: async () => {
        try {
          const { refreshToken } = get();
          if (!refreshToken) throw new Error('No refresh token');
          
          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken } = response.data;
          
          set({ accessToken });
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          
          return accessToken;
        } catch (error) {
          get().logout();
          throw error;
        }
      },

      setCurrentShift: (shift) => set({ currentShift: shift }),

      setCurrentLocation: (location) => set({ currentLocation: location }),

      hasPermission: (permission) => {
        const { user } = get();
        if (!user?.permissions) return false;
        
        // Admin has all permissions
        if (user.permissions.includes('*')) return true;
        
        // Check exact match
        if (user.permissions.includes(permission)) return true;
        
        // Check wildcard
        const wildcardPermission = permission.split('.')[0] + '.*';
        return user.permissions.includes(wildcardPermission);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        currentLocation: state.currentLocation,
      }),
    }
  )
);

// Initialize auth on app load
const initializeAuth = () => {
  const { accessToken, isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated && accessToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }
};

initializeAuth();
