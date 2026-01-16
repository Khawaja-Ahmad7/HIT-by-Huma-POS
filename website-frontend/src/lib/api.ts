const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface Variant {
    id: number;
    name: string | null;
    sku: string;
    price: number;
}

export interface Product {
    id: number;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    categoryId: number | null;
    categoryName: string | null;
    variants: Variant[];
}

export interface Category {
    id: number;
    name: string;
    description: string | null;
}

export interface CartItem {
    product: Product;
    variant: Variant;
    quantity: number;
}

export interface OrderData {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerAddress?: string;
    customerCity?: string;
    items: Array<{
        variantId: number;
        quantity: number;
    }>;
    notes?: string;
}

export interface OrderResponse {
    success: boolean;
    orderNumber: string;
    orderId: number;
    total: number;
    message: string;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Request failed');
        }

        return response.json();
    }

    async getProducts(categoryId?: number): Promise<{ products: Product[]; pagination: any }> {
        const params = categoryId ? `?categoryId=${categoryId}` : '';
        return this.fetch(`/products${params}`);
    }

    async getProduct(id: number): Promise<Product> {
        return this.fetch(`/products/${id}`);
    }

    async getCategories(): Promise<Category[]> {
        return this.fetch('/products/categories/list');
    }

    async createOrder(data: OrderData): Promise<OrderResponse> {
        return this.fetch('/orders', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async getOrderStatus(orderNumber: string): Promise<{ orderNumber: string; status: string; total: number }> {
        return this.fetch(`/orders/${orderNumber}/status`);
    }
}

export const api = new ApiClient(API_URL);
