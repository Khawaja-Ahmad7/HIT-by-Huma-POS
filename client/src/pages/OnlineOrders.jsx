import { useState, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    XCircleIcon,
    ShoppingBagIcon,
    ClockIcon,
    TruckIcon
} from '@heroicons/react/24/outline';
import { ordersService } from '../services/orders';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-hot-toast';

export default function OnlineOrders() {
    const { user } = useAuthStore();
    const [orders, setOrders] = useState([]);
    const [statusCounts, setStatusCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Use user's location or default to 1 (Main Store)
    const locationId = user?.locationId || 1;

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const response = await ordersService.getAll({
                status: activeTab === 'all' ? undefined : activeTab,
                limit: 50
            });
            setOrders(response.data.orders);
            setStatusCounts(response.data.statusCounts);
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast.error('Failed to load orders');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();

        // Poll for updates every 30 seconds
        const interval = setInterval(fetchOrders, 30000);
        return () => clearInterval(interval);
    }, [activeTab]);

    const handleStatusUpdate = async (orderId, newStatus) => {
        try {
            setProcessing(true);
            await ordersService.updateStatus(orderId, newStatus);
            toast.success(`Order marked as ${newStatus}`);
            fetchOrders();
            if (selectedOrder) setSelectedOrder(null);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to update status');
        } finally {
            setProcessing(false);
        }
    };

    const handleProcessOrder = async (orderId) => {
        try {
            setProcessing(true);
            await ordersService.process(orderId, locationId);
            toast.success('Order processed and inventory deducted');
            fetchOrders();
            if (selectedOrder) setSelectedOrder(null);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to process order');
        } finally {
            setProcessing(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'confirmed': return 'bg-blue-100 text-blue-800';
            case 'processing': return 'bg-purple-100 text-purple-800';
            case 'ready': return 'bg-indigo-100 text-indigo-800';
            case 'completed': return 'bg-green-100 text-green-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatPrice = (price) => `Rs. ${parseFloat(price).toLocaleString()}`;
    const formatDate = (dateString) => new Date(dateString).toLocaleString();

    const tabs = [
        { id: 'pending', name: 'Pending', icon: ClockIcon },
        { id: 'confirmed', name: 'Confirmed', icon: CheckCircleIcon },
        { id: 'processing', name: 'Processing', icon: ShoppingBagIcon },
        { id: 'ready', name: 'Ready', icon: TruckIcon },
        { id: 'completed', name: 'Completed', icon: CheckCircleIcon },
        { id: 'cancelled', name: 'Cancelled', icon: XCircleIcon },
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Online Orders</h1>
                    <button
                        onClick={fetchOrders}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex space-x-1 overflow-x-auto pb-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                flex items-center px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                ${activeTab === tab.id
                                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-700/10'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}
              `}
                        >
                            <tab.icon className="w-4 h-4 mr-2" />
                            {tab.name}
                            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === tab.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'}`}>
                                {statusCounts[tab.id] || 0}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-hidden flex gap-6">
                {/* Order List */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                    <div className="overflow-y-auto flex-1">
                        {orders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <ShoppingBagIcon className="w-12 h-12 mb-2 text-gray-300" />
                                <p>No {activeTab} orders found</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {orders.map((order) => (
                                    <div
                                        key={order.order_id}
                                        onClick={() => setSelectedOrder(order)}
                                        className={`
                      p-4 cursor-pointer hover:bg-gray-50 transition-colors
                      ${selectedOrder?.order_id === order.order_id ? 'bg-primary-50 ring-1 ring-inset ring-primary-500/20' : ''}
                    `}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <span className="font-medium text-gray-900">#{order.order_number}</span>
                                                <span className="text-sm text-gray-500 ml-2">by {order.customer_name}</span>
                                            </div>
                                            <span className="font-bold text-gray-900">{formatPrice(order.total_amount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm text-gray-500">
                                            <span>{order.item_count} items • {formatDate(order.created_at)}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                                                {order.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Order Detail View (Side Panel) */}
                {selectedOrder ? (
                    <div className="w-96 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                        <DetailView
                            order={selectedOrder}
                            loading={processing}
                            onClose={() => setSelectedOrder(null)}
                            onUpdateStatus={handleStatusUpdate}
                            onProcess={handleProcessOrder}
                        />
                    </div>
                ) : (
                    <div className="w-96 bg-gray-50 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                        <p>Select an order to view details</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function DetailView({ order, loading, onClose, onUpdateStatus, onProcess }) {
    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(true);

    useEffect(() => {
        const fetchItems = async () => {
            try {
                setLoadingItems(true);
                const response = await ordersService.getById(order.order_id);
                setItems(response.data.items);
            } catch (error) {
                toast.error('Failed to load order items');
            } finally {
                setLoadingItems(false);
            }
        };
        fetchItems();
    }, [order.order_id]);

    const formatPrice = (price) => `Rs. ${parseFloat(price).toLocaleString()}`;

    return (
        <div className="flex flex-col h-full">
            {/* Detail Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-start bg-gray-50">
                <div>
                    <h2 className="font-bold text-lg text-gray-900">#{order.order_number}</h2>
                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <XCircleIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Customer Info */}
            <div className="p-4 border-b border-gray-200">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer</h3>
                <p className="font-medium">{order.customer_name}</p>
                <p className="text-sm text-gray-600">{order.customer_phone}</p>
                {order.customer_address && (
                    <p className="text-sm text-gray-600 mt-1">{order.customer_address}, {order.customer_city}</p>
                )}
                {order.notes && (
                    <div className="mt-2 text-sm bg-yellow-50 text-yellow-800 p-2 rounded border border-yellow-200">
                        Note: {order.notes}
                    </div>
                )}
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items ({items.length})</h3>
                {loadingItems ? (
                    <div className="flex justify-center py-4"><ArrowPathIcon className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <div key={item.order_item_id} className="flex gap-3">
                                <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                                    {item.image_url && <img src={item.image_url} className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                                    <p className="text-xs text-gray-500">{item.variant_name} • {item.sku}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium">{formatPrice(item.line_total)}</p>
                                    <p className="text-xs text-gray-500">{item.quantity} x {formatPrice(item.unit_price)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Totals */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex justify-between items-center mb-4">
                    <span className="font-medium text-gray-700">Total Amount</span>
                    <span className="font-bold text-xl text-primary-600">{formatPrice(order.total_amount)}</span>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-1 gap-2">
                    {order.status === 'pending' && (
                        <>
                            <button
                                onClick={() => onUpdateStatus(order.order_id, 'confirmed')}
                                disabled={loading}
                                className="btn-primary w-full justify-center"
                            >
                                Accept Order
                            </button>
                            <button
                                onClick={() => onUpdateStatus(order.order_id, 'cancelled')}
                                disabled={loading}
                                className="btn-secondary w-full justify-center text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                Cancel Order
                            </button>
                        </>
                    )}

                    {order.status === 'confirmed' && (
                        <button
                            onClick={() => onProcess(order.order_id)}
                            disabled={loading}
                            className="btn-primary w-full justify-center bg-purple-600 hover:bg-purple-700"
                        >
                            Process (Deduct Stock)
                        </button>
                    )}

                    {order.status === 'processing' && (
                        <button
                            onClick={() => onUpdateStatus(order.order_id, 'ready')}
                            disabled={loading}
                            className="btn-primary w-full justify-center bg-indigo-600 hover:bg-indigo-700"
                        >
                            Mark Ready for Pickup
                        </button>
                    )}

                    {order.status === 'ready' && (
                        <button
                            onClick={() => onUpdateStatus(order.order_id, 'completed')}
                            disabled={loading}
                            className="btn-primary w-full justify-center bg-green-600 hover:bg-green-700"
                        >
                            Complete Order
                        </button>
                    )}

                    {(order.status === 'completed' || order.status === 'cancelled') && (
                        <div className="text-center text-sm text-gray-500 py-2">
                            Order is {order.status}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
