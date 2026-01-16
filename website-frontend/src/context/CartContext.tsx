'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Variant, CartItem } from '@/lib/api';

interface CartContextType {
    items: CartItem[];
    addItem: (product: Product, variant: Variant, quantity?: number) => void;
    removeItem: (variantId: number) => void;
    updateQuantity: (variantId: number, quantity: number) => void;
    clearCart: () => void;
    itemCount: number;
    total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'hitbyhuma_cart';

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);

    // Load cart from localStorage on mount
    useEffect(() => {
        try {
            const savedCart = localStorage.getItem(CART_STORAGE_KEY);
            if (savedCart) {
                setItems(JSON.parse(savedCart));
            }
        } catch (error) {
            console.error('Failed to load cart:', error);
        }
        setIsHydrated(true);
    }, []);

    // Save cart to localStorage whenever it changes
    useEffect(() => {
        if (isHydrated) {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
        }
    }, [items, isHydrated]);

    const addItem = (product: Product, variant: Variant, quantity = 1) => {
        setItems(current => {
            const existingIndex = current.findIndex(item => item.variant.id === variant.id);

            if (existingIndex >= 0) {
                // Update quantity of existing item
                const updated = [...current];
                updated[existingIndex] = {
                    ...updated[existingIndex],
                    quantity: updated[existingIndex].quantity + quantity,
                };
                return updated;
            }

            // Add new item
            return [...current, { product, variant, quantity }];
        });
    };

    const removeItem = (variantId: number) => {
        setItems(current => current.filter(item => item.variant.id !== variantId));
    };

    const updateQuantity = (variantId: number, quantity: number) => {
        if (quantity <= 0) {
            removeItem(variantId);
            return;
        }

        setItems(current =>
            current.map(item =>
                item.variant.id === variantId ? { ...item, quantity } : item
            )
        );
    };

    const clearCart = () => {
        setItems([]);
    };

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                items,
                addItem,
                removeItem,
                updateQuantity,
                clearCart,
                itemCount,
                total,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
