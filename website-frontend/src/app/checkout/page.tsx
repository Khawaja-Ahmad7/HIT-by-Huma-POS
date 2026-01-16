'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ShoppingBag, Loader2, CheckCircle } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { api } from '@/lib/api';

export default function CheckoutPage() {
    const router = useRouter();
    const { items, total, clearCart } = useCart();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: '',
        customerCity: '',
        notes: '',
    });

    const formatPrice = (price: number) => {
        return `Rs. ${price.toLocaleString()}`;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (items.length === 0) {
            setError('Your cart is empty');
            return;
        }

        setLoading(true);

        try {
            const orderItems = items.map(item => ({
                variantId: item.variant.id,
                quantity: item.quantity,
            }));

            const response = await api.createOrder({
                customerName: formData.customerName,
                customerPhone: formData.customerPhone,
                customerEmail: formData.customerEmail || undefined,
                customerAddress: formData.customerAddress || undefined,
                customerCity: formData.customerCity || undefined,
                items: orderItems,
                notes: formData.notes || undefined,
            });

            // Clear cart and redirect to success page
            clearCart();
            router.push(`/order-success?orderNumber=${response.orderNumber}`);

        } catch (err: any) {
            setError(err.message || 'Failed to place order. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                    <ShoppingBag className="w-12 h-12 text-gray-300" />
                </div>
                <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Your cart is empty</h1>
                <p className="text-gray-500 mb-6">Add some items before checkout.</p>
                <Link href="/" className="btn-primary">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Continue Shopping
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
            {/* Header */}
            <div className="mb-8">
                <Link href="/cart" className="text-brand hover:text-brand-dark font-medium flex items-center gap-1 mb-4">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Cart
                </Link>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900">Checkout</h1>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Customer Information Form */}
                <div>
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                        <h2 className="font-display font-bold text-lg mb-6">Your Information</h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">
                                    Full Name *
                                </label>
                                <input
                                    type="text"
                                    id="customerName"
                                    name="customerName"
                                    required
                                    value={formData.customerName}
                                    onChange={handleInputChange}
                                    className="input"
                                    placeholder="Enter your full name"
                                />
                            </div>

                            <div>
                                <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone Number *
                                </label>
                                <input
                                    type="tel"
                                    id="customerPhone"
                                    name="customerPhone"
                                    required
                                    value={formData.customerPhone}
                                    onChange={handleInputChange}
                                    className="input"
                                    placeholder="03XX XXXXXXX"
                                />
                            </div>

                            <div>
                                <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                    Email (Optional)
                                </label>
                                <input
                                    type="email"
                                    id="customerEmail"
                                    name="customerEmail"
                                    value={formData.customerEmail}
                                    onChange={handleInputChange}
                                    className="input"
                                    placeholder="your@email.com"
                                />
                            </div>

                            <div>
                                <label htmlFor="customerCity" className="block text-sm font-medium text-gray-700 mb-1">
                                    City
                                </label>
                                <input
                                    type="text"
                                    id="customerCity"
                                    name="customerCity"
                                    value={formData.customerCity}
                                    onChange={handleInputChange}
                                    className="input"
                                    placeholder="Your city"
                                />
                            </div>

                            <div>
                                <label htmlFor="customerAddress" className="block text-sm font-medium text-gray-700 mb-1">
                                    Delivery Address
                                </label>
                                <textarea
                                    id="customerAddress"
                                    name="customerAddress"
                                    rows={3}
                                    value={formData.customerAddress}
                                    onChange={handleInputChange}
                                    className="input resize-none"
                                    placeholder="Enter your full delivery address"
                                />
                            </div>

                            <div>
                                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                                    Order Notes (Optional)
                                </label>
                                <textarea
                                    id="notes"
                                    name="notes"
                                    rows={2}
                                    value={formData.notes}
                                    onChange={handleInputChange}
                                    className="input resize-none"
                                    placeholder="Any special instructions..."
                                />
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full mt-6"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Placing Order...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5 mr-2" />
                                        Place Order - {formatPrice(total)}
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Order Summary */}
                <div>
                    <div className="bg-gray-50 rounded-2xl p-6 sticky top-24">
                        <h2 className="font-display font-bold text-lg mb-4">Order Summary</h2>

                        {/* Items */}
                        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                            {items.map((item) => (
                                <div key={item.variant.id} className="flex gap-3 bg-white rounded-lg p-3">
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                        {item.product.imageUrl ? (
                                            <Image
                                                src={item.product.imageUrl}
                                                alt={item.product.name}
                                                width={64}
                                                height={64}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <ShoppingBag className="w-6 h-6 text-gray-300" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-gray-900 truncate">{item.product.name}</p>
                                        {item.variant.name && (
                                            <p className="text-xs text-gray-500">{item.variant.name}</p>
                                        )}
                                        <p className="text-sm text-gray-600 mt-1">
                                            Qty: {item.quantity} × {formatPrice(item.variant.price)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-brand">
                                            {formatPrice(item.variant.price * item.quantity)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div className="border-t border-gray-200 pt-4 space-y-2">
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

                        <p className="text-xs text-gray-500 mt-4 text-center">
                            We will contact you to confirm your order and provide delivery details.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
