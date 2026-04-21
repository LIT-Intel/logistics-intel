/**
 * Step 4: Payment Method
 * Collects or confirms payment method for subscription
 */

import React, { useState } from 'react';
import { CreditCard, Lock } from 'lucide-react';

interface Step4PaymentProps {
  planName: string;
  price: string;
  onNext: (data: { cardLast4?: string; paymentMethod: 'card' | 'invoice' }) => void;
  isLoading?: boolean;
}

export function Step4Payment({
  planName,
  price,
  onNext,
  isLoading = false,
}: Step4PaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'invoice'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvc, setCvc] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCard = () => {
    const newErrors: Record<string, string> = {};

    if (!cardNumber.replace(/\s/g, '')) newErrors.cardNumber = 'Card number is required';
    else if (cardNumber.replace(/\s/g, '').length !== 16)
      newErrors.cardNumber = 'Invalid card number';

    if (!expiryDate) newErrors.expiryDate = 'Expiry date is required';
    if (!cvc) newErrors.cvc = 'CVC is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (paymentMethod === 'card') {
      if (!validateCard()) return;
      const last4 = cardNumber.replace(/\s/g, '').slice(-4);
      onNext({ cardLast4: last4, paymentMethod: 'card' });
    } else {
      onNext({ paymentMethod: 'invoice' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Payment method</h2>
        <p className="mt-2 text-slate-600">
          Secure payment for {planName} plan
        </p>
      </div>

      {/* Order Summary */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-slate-600">{planName} Plan</p>
            <p className="text-lg font-semibold text-slate-900">{price}/month</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600">First month</p>
            <p className="text-2xl font-bold text-slate-900">{price}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Payment Method Selection */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition"
            style={{
              borderColor: paymentMethod === 'card' ? '#4f46e5' : '#e2e8f0',
              backgroundColor: paymentMethod === 'card' ? '#f0f4ff' : '#fff',
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === 'card'}
              onChange={() => setPaymentMethod('card')}
              className="h-4 w-4"
            />
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              <span className="font-medium">Credit Card</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition"
            style={{
              borderColor: paymentMethod === 'invoice' ? '#4f46e5' : '#e2e8f0',
              backgroundColor: paymentMethod === 'invoice' ? '#f0f4ff' : '#fff',
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="invoice"
              checked={paymentMethod === 'invoice'}
              onChange={() => setPaymentMethod('invoice')}
              className="h-4 w-4"
            />
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <span className="font-medium">Invoice (Wire Transfer)</span>
            </div>
          </label>
        </div>

        {/* Card Details (if card selected) */}
        {paymentMethod === 'card' && (
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Card Number
              </label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) =>
                  setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))
                }
                placeholder="4242 4242 4242 4242"
                maxLength={19}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition"
              />
              {errors.cardNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.cardNumber}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expiry Date
                </label>
                <input
                  type="text"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  placeholder="MM/YY"
                  maxLength={5}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition"
                />
                {errors.expiryDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.expiryDate}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  CVC
                </label>
                <input
                  type="text"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                  maxLength={4}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition"
                />
                {errors.cvc && <p className="mt-1 text-sm text-red-600">{errors.cvc}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Invoice Info */}
        {paymentMethod === 'invoice' && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm text-blue-900">
              We'll send you an invoice. Payment due within 30 days of invoice date.
            </p>
          </div>
        )}

        {/* Security Notice */}
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Lock className="h-4 w-4" />
          <span>Your payment information is encrypted and secure</span>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {isLoading ? 'Processing...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
