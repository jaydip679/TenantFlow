import React, { useState } from 'react';
import { createOrder, verifyPayment } from '../../services/subscriptionService.js';
import { loadScript, formatCurrency } from '../../utils/helpers.js';
import { useSelector } from 'react-redux';
import { Loader2 } from 'lucide-react';

export default function RazorpayCheckout({ invoiceId, amount, tenantName, onSuccess, onFailure }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const accessToken = useSelector((s) => s.auth.accessToken);

  const handlePay = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Create Razorpay order
      const orderRes = await createOrder({ invoiceId });
      const { orderId, amount: orderAmount, currency, razorpayKeyId } = orderRes.data.data;

      // 2. Dynamically load Razorpay checkout script
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');

      if (!window.Razorpay) throw new Error('Razorpay SDK failed to load.');

      // 3. Open checkout
      const rzp = new window.Razorpay({
        key:         razorpayKeyId,
        order_id:    orderId,
        amount:      orderAmount,
        currency:    currency || 'INR',
        name:        'TenantFlow',
        description: `Invoice Payment`,
        prefill:     { name: tenantName || '' },
        theme:       { color: '#6c63ff' },
        modal:       { ondismiss: () => setLoading(false) },
        handler: async (response) => {
          try {
            // 4. Verify payment
            await verifyPayment({
              razorpayOrderId:   response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            // 5. Success — Socket.IO payment:success event will also fire in background
            if (onSuccess) onSuccess();
          } catch (verifyErr) {
            setError('Payment verification failed. Please contact support.');
            if (onFailure) onFailure(verifyErr);
          } finally {
            setLoading(false);
          }
        },
      });

      rzp.on('payment.failed', (response) => {
        setError(`Payment failed: ${response.error.description}`);
        setLoading(false);
        if (onFailure) onFailure(response.error);
      });

      rzp.open();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to initiate payment.');
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-2 p-2 rounded-md bg-danger/10 border border-danger/20 text-danger text-xs font-medium">
          {error}
        </div>
      )}
      <button
        id={`pay-btn-${invoiceId}`}
        className="px-3 py-1.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-xs font-semibold transition-colors flex items-center justify-center min-w-[110px]"
        onClick={handlePay}
        disabled={loading}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          `Pay ${formatCurrency(amount)}`
        )}
      </button>
    </div>
  );
}
