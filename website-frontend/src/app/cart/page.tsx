'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, ArrowRight } from 'lucide-react';
import { useCart } from '@/context/CartContext';

export default function CartPage() {
    const { items, removeItem, updateQuantity, total, itemCount } = useCart();

    const formatPrice = (price: number) => {
        return `Rs. ${price.toLocaleString()}`;
    };

    if (items.length === 0) {
        return (
            <div className="min-h-[calc(100vh-250px)] flex flex-col items-center justify-center px-4 py-20">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                    <ShoppingBag className="w-12 h-12 text-gray-300" />
                </div>
                <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Your cart is empty</h1>
                <p className="text-gray-500 mb-6">Looks like you haven&apos;t added anything yet.</p>
                <Link href="/" className="btn-primary">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Continue Shopping
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900">
                        Shopping Cart
                        <span className="text-gray-400 font-normal text-lg ml-2">({itemCount} items)</span>
                    </h1>
                    <Link href="/" className="text-brand hover:text-brand-dark font-medium flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" />
                        Continue Shopping
                    </Link>
                </div>

                {/* Cart Items */}
                <div className="space-y-4 mb-8">
                    {items.map((item) => (
                        <div
                            key={item.variant.id}
                            className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 animate-fade-in"
                        >
                            {/* Product Image */}
                            <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                {item.product.imageUrl ? (
                                    <Image
                                        src={item.product.imageUrl}
                                        alt={item.product.name}
                                        width={96}
                                        height={96}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <ShoppingBag className="w-8 h-8 text-gray-300" />
                                    </div>
                                )}
                            </div>

                            {/* Product Details */}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 truncate">{item.product.name}</h3>
                                {item.variant.name && (
                                    <p className="text-sm text-gray-500">{item.variant.name}</p>
                                )}
                                <p className="text-brand font-bold mt-1">{formatPrice(item.variant.price)}</p>
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center border border-gray-200 rounded-lg">
                                    <button
                                        onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                                        className="p-2 hover:bg-gray-100 transition-colors rounded-l-lg"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="px-4 py-2 font-semibold min-w-[3rem] text-center">
                                        {item.quantity}
                                    </span>
                                    <button
                                        onClick={() => updateQuantity(item.variant.id, item.quantity + 1)}
                                        className="p-2 hover:bg-gray-100 transition-colors rounded-r-lg"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Line Total */}
                                <div className="text-right min-w-[100px]">
                                    <p className="font-bold text-gray-900">
                                        {formatPrice(item.variant.price * item.quantity)}
                                    </p>
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={() => removeItem(item.variant.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="bg-gray-50 rounded-2xl p-6">
                    <h2 className="font-display font-bold text-lg mb-4">Order Summary</h2>

                    <div className="space-y-3 mb-6">
                        <div className="flex justify-between text-gray-600">
                            <span>Subtotal</span>
                            <span>{formatPrice(total)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>Delivery</span>
                            <span className="text-green-600">To be confirmed</span>
                        </div>
                        <div className="border-t border-gray-200 pt-3 flex justify-between">
                            <span className="font-bold text-lg">Total</span>
                            <span className="font-bold text-xl text-brand">{formatPrice(total)}</span>
                        </div>
                    </div>

                    <Link href="/checkout" className="btn-primary w-full text-center">
                        Proceed to Checkout
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
