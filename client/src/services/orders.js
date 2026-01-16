import api from './api';

export const ordersService = {
    // Get all online orders with filters
    getAll: (params) => api.get('/orders', { params }),

    // Get order details
    getById: (id) => api.get(`/orders/${id}`),

    // Update order status (pending -> confirmed, etc)
    updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),

    // Process order (deduct inventory and mark as completed)
    process: (id, locationId) => api.post(`/orders/${id}/process`, { locationId }),
};
