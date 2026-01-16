'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Home, Phone } from 'lucide-react';
import { Suspense } from 'react';

function OrderSuccessContent() {
    const searchParams = useSearchParams();
    const orderNumber = searchParams.get('orderNumber');

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
            <div className="text-center max-w-md">
                {/* Success Icon */}
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-scale-in">
                    <CheckCircle className="w-12 h-12 text-green-500" />
                </div>

                {/* Success Message */}
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">
                    Order Placed!
                </h1>
                <p className="text-gray-600 mb-6">
                    Thank you for your order. We will contact you shortly to confirm the details.
                </p>

                {/* Order Number */}
                {orderNumber && (
                    <div className="bg-gray-50 rounded-xl px-6 py-4 mb-8 inline-block">
                        <p className="text-sm text-gray-500 mb-1">Order Number</p>
                        <p className="text-xl font-bold text-brand">{orderNumber}</p>
                    </div>
                )}

                {/* Info Card */}
                <div className="bg-brand/5 border border-brand/20 rounded-xl p-6 mb-8 text-left">
                    <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
                    <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-start gap-2">
                            <span className="w-5 h-5 bg-brand text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                            <span>We will call you to confirm your order</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-5 h-5 bg-brand text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                            <span>We will discuss delivery options and payment</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-5 h-5 bg-brand text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                            <span>Your order will be prepared and dispatched</span>
                        </li>
                    </ul>
                </div>

                {/* Contact Info */}
                <div className="flex items-center justify-center gap-2 text-gray-600 mb-8">
                    <Phone className="w-4 h-4" />
                    <span>Need help? Call us at <strong>+92 300 1234567</strong></span>
                </div>

                {/* Actions */}
                <Link href="/" className="btn-primary inline-flex items-center">
                    <Home className="w-4 h-4 mr-2" />
                    Continue Shopping
                </Link>
            </div>
        </div>
    );
}

export default function OrderSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-[70vh] flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Loading...</div>
            </div>
        }>
            <OrderSuccessContent />
        </Suspense>
    );
}
