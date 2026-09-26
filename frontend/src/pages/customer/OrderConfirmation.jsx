import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Mirrors the backend's ORDER_STATUS_TRANSITIONS (products/views.py):
// OrderCancelView only ever allows cancelling from pending or confirmed.
// This is a client-side mirror purely to decide whether to show the Cancel
// button — the backend re-validates and rejects with 400 regardless of
// what the frontend shows, so this never changes the actual status rules.
const CANCELLABLE_STATUSES = ['pending', 'confirmed']

function canCancelOrder(status) {
  return CANCELLABLE_STATUSES.includes(status)
}

// Mirrors PaymentCreateView's own eligibility checks (products/views.py):
// ORDER_STATUSES_INELIGIBLE_FOR_PAYMENT (delivered/cancelled — the two
// terminal statuses) can't accept a new payment attempt, and an order that
// already has a `paid` payment can't either. This is a client-side mirror
// purely to decide whether to show the Pay Now button — the backend
// re-validates and rejects with 400 regardless of what the frontend shows,
// so this never changes the actual payment eligibility rules.
const PAYMENT_INELIGIBLE_STATUSES = ['delivered', 'cancelled']

function canPayForOrder(order) {
  if (PAYMENT_INELIGIBLE_STATUSES.includes(order.status)) return false
  return !(order.payments ?? []).some((payment) => payment.status === 'paid')
}

// Page styles, scoped under `.order-page`. Rendered through a <style> with
// `href` + `precedence` so React 19 hoists it into the document head once.
// Colors use light-dark() to follow the app's `color-scheme: light dark`,
// matching the rest of the customer pages. `.order-page-success` is added
// only right after checkout, and centers the header as a success layout.
const orderConfirmationStyles = `
  .order-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .order-page .order-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .order-page .order-message {
    margin: 0 0 16px;
    line-height: 1.6;
  }

  .order-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .order-page [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  /* Success layout: check mark, centered title and thank-you message. */
  .order-page .order-success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    border-radius: 50%;
    background-color: light-dark(#1b6e3c, #6ddc98);
    color: light-dark(#ffffff, #111111);
    font-size: 2rem;
    line-height: 1;
  }

  .order-page-success .order-title {
    margin-bottom: 16px;
    text-align: center;
  }

  .order-page .order-thanks {
    margin: 0 0 32px;
    font-size: 1.05rem;
    text-align: center;
  }

  /* Order number and status. */
  .order-page .order-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 24px;
    padding: 20px 24px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .order-page-success .order-header {
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }

  .order-page .order-number {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
  }

  .order-page .order-status {
    margin: 0;
    padding: 4px 14px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* Shipping address, items, and payment, each a card. */
  .order-page .order-shipping-section,
  .order-page .order-items-section,
  .order-page .order-payments-section {
    margin-bottom: 24px;
    padding: 24px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .order-page .order-shipping-section h2,
  .order-page .order-items-section h2,
  .order-page .order-payments-section h2 {
    margin: 0 0 16px;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .order-page .order-shipping-section p {
    margin: 0;
    line-height: 1.6;
  }

  .order-page .order-shipping-section .address-name {
    margin-bottom: 4px;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .order-page .order-shipping-section .address-phone,
  .order-page .order-shipping-section .address-lines,
  .order-page .order-shipping-section .address-region,
  .order-page .order-shipping-section .address-country {
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .order-page .cart-item-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One row per item: name and variant stack in the first column; quantity,
     unit price and line subtotal each get their own column. */
  .order-page .cart-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 110px 100px;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 24px;
    padding: 16px 0;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .order-page .cart-item:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .order-page .cart-item-name {
    grid-column: 1;
    grid-row: 1;
    align-self: end;
    font-weight: 500;
    line-height: 1.4;
  }

  .order-page .cart-item-variant {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    margin-top: 4px;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    opacity: 0.65;
    text-transform: uppercase;
  }

  .order-page .cart-item-quantity {
    grid-column: 2;
    grid-row: 1 / span 2;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .order-page .cart-item-unit-price {
    grid-column: 3;
    grid-row: 1 / span 2;
    font-size: 0.9rem;
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
  }

  .order-page .cart-item-subtotal {
    grid-column: 4;
    grid-row: 1 / span 2;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }

  /* Total: prominent, under a heavy rule. */
  .order-page .cart-total {
    margin: 8px 0 0;
    padding-top: 20px;
    border-top: 2px solid light-dark(#111111, #f5f5f5);
    font-size: clamp(1.4rem, 4vw, 1.9rem);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-align: right;
  }

  /* Primary: Continue Shopping. The outline variant is used for the
     error-state Browse Products link. */
  .order-page .order-button {
    display: block;
    width: fit-content;
    margin-top: 32px;
    padding: 16px 48px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
    font-size: 0.9rem;
    letter-spacing: 0.15em;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .order-page-success .order-button {
    margin-right: auto;
    margin-left: auto;
  }

  .order-page .order-button:hover,
  .order-page .order-button:focus-visible {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .order-page .order-button-outline {
    margin-top: 0;
    padding: 12px 24px;
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
  }

  .order-page .order-button-outline:hover,
  .order-page .order-button-outline:focus-visible {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .order-page .order-button-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .order-page .order-cancel-button {
    margin: 0 0 24px;
    font: inherit;
    letter-spacing: 0.12em;
    cursor: pointer;
  }

  .order-page .order-pay-button {
    margin: 0 0 16px;
    font: inherit;
    letter-spacing: 0.12em;
    cursor: pointer;
  }

  .order-page .order-payment-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .order-page .order-payment-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 12px 0;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
    font-size: 0.9rem;
  }

  .order-page .order-payment-row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .order-page .order-payment-provider {
    font-weight: 500;
    text-transform: capitalize;
  }

  .order-page .order-payment-amount {
    font-weight: 500;
    white-space: nowrap;
  }

  .order-page .order-payment-date {
    margin-left: auto;
    opacity: 0.7;
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    .order-page {
      padding: 24px 16px 48px;
    }

    .order-page .order-header {
      padding: 16px;
    }

    /* Long order numbers wrap: balance the lines so the break isn't left
       dangling right after "ORD-". */
    .order-page .order-number {
      font-size: 1.05rem;
      text-wrap: balance;
    }

    .order-page .order-shipping-section,
    .order-page .order-items-section {
      padding: 20px 16px;
    }

    .order-page .order-button {
      width: 100%;
    }

    /* Two-column item rows: name and variant span the top; quantity and
       subtotal share the next row; unit price sits under the quantity. */
    .order-page .cart-item {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: none;
      /* No row-gap: the variant row is absent for items without a size or
         color, so spacing comes from margins to avoid a doubled gap. */
      row-gap: 0;
    }

    .order-page .cart-item-name {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .order-page .cart-item-variant {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .order-page .cart-item-quantity {
      grid-column: 1;
      grid-row: 3;
      margin-top: 8px;
    }

    .order-page .cart-item-subtotal {
      grid-column: 2;
      grid-row: 3;
      margin-top: 8px;
    }

    .order-page .cart-item-unit-price {
      grid-column: 1 / -1;
      grid-row: 4;
      margin-top: 4px;
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .order-page .order-button {
      transition: none;
    }
  }
`

function OrderConfirmation() {
  const { id } = useParams()
  const { state } = useLocation()
  const { accessToken } = useAuth()

  const [order, setOrder] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Cancellation feedback, kept separate from the initial-load state above
  // so a cancel failure doesn't blank out the whole order view.
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelSuccess, setCancelSuccess] = useState('')

  // Same pattern for the Pay Now action — kept separate from the cancel
  // state above so the two actions' feedback never overwrites each other.
  const [isPaying, setIsPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [paySuccess, setPaySuccess] = useState('')

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false
    setIsLoading(true)
    setError('')

    apiGet(ENDPOINTS.orderDetail(id), { accessToken })
      .then((data) => {
        if (!cancelled) setOrder(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load this order.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, id])

  async function handleCancelOrder() {
    if (!window.confirm(`Cancel order ${order.order_number}? This cannot be undone.`)) return

    setCancelError('')
    setCancelSuccess('')
    setIsCancelling(true)
    try {
      // The endpoint takes no request body — it only ever acts on the
      // order in the URL, scoped to the signed-in user.
      const updatedOrder = await apiPost(ENDPOINTS.orderCancel(order.id), null, { accessToken })
      setOrder(updatedOrder)
      setCancelSuccess('Your order has been cancelled.')
    } catch (err) {
      // A 400 here means the order is no longer cancellable (e.g. it was
      // already shipped) — the backend's own message explains why.
      setCancelError(err.message || 'Unable to cancel this order.')
    } finally {
      setIsCancelling(false)
    }
  }

  async function handlePayNow() {
    setPayError('')
    setPaySuccess('')
    setIsPaying(true)
    try {
      // 'manual' is one of the backend's own accepted provider values
      // (PAYMENT_PROVIDERS in products/views.py) — no real gateway is
      // integrated here, this just records a payment attempt against the
      // order for development/testing, exactly as the endpoint is designed
      // to be used today.
      await apiPost(ENDPOINTS.orderPay(order.id), { provider: 'manual' }, { accessToken })
      // Re-fetch the order rather than locally appending the new payment:
      // starting an attempt also supersedes (cancels) any pending/
      // processing attempt already on this order server-side, but the
      // create response only describes the new payment, not that
      // side effect — a plain append would leave a stale "pending" badge
      // on the one that just got superseded. A fresh GET is the only way
      // to reflect every payment's true current status.
      const refreshedOrder = await apiGet(ENDPOINTS.orderDetail(order.id), { accessToken })
      setOrder(refreshedOrder)
      setPaySuccess('Payment attempt recorded.')
    } catch (err) {
      // A 400 here means the order stopped being eligible for a new
      // payment attempt before this request completed — e.g. it was
      // cancelled or delivered, or already paid, possibly by another
      // action in flight at the same time. The backend's own message
      // explains why, and the order's local state is left untouched, so
      // nothing is ever shown as paid unless the backend actually
      // confirms it.
      setPayError(err.message || 'Unable to process payment for this order.')
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <>
      <Navbar />
      <style href="order-confirmation-styles" precedence="default">
        {orderConfirmationStyles}
      </style>
      <main className={state?.justPlaced ? 'order-page order-page-success' : 'order-page'}>
        {state?.justPlaced && (
          <span className="order-success-icon" aria-hidden="true">
            ✓
          </span>
        )}

        <h1 className="order-title">{state?.justPlaced ? 'Order Placed' : 'Order Details'}</h1>

        {isLoading && <p className="order-message">Loading your order...</p>}

        {!isLoading && error && (
          <>
            <p role="alert" className="order-message">
              {error}
            </p>
            <Link to="/products" className="order-button order-button-outline">
              Browse Products
            </Link>
          </>
        )}

        {!isLoading && !error && order && (
          <>
            {state?.justPlaced && (
              <p role="status" className="order-thanks">
                Thank you! Your order has been placed.
              </p>
            )}

            <div className="order-header">
              <p className="order-number">Order number: {order.order_number}</p>
              <p className="order-status">Status: {order.status}</p>
            </div>

            {cancelError && (
              <p role="alert" className="order-message">
                {cancelError}
              </p>
            )}
            {cancelSuccess && (
              <p role="status" className="order-message">
                {cancelSuccess}
              </p>
            )}

            {canCancelOrder(order.status) && (
              <button
                type="button"
                className="order-button order-button-outline order-cancel-button"
                onClick={handleCancelOrder}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            )}

            <section className="order-shipping-section">
              <h2>Shipping Address</h2>
              <p className="address-name">{order.shipping_full_name}</p>
              <p className="address-phone">{order.shipping_phone}</p>
              <p className="address-lines">
                {order.shipping_address_line1}
                {order.shipping_address_line2 ? `, ${order.shipping_address_line2}` : ''}
              </p>
              <p className="address-region">
                {order.shipping_city}, {order.shipping_state} {order.shipping_postal_code}
              </p>
              <p className="address-country">{order.shipping_country}</p>
            </section>

            <section className="order-items-section">
              <h2>Items</h2>

              <ul className="cart-item-list">
                {order.items.map((item) => {
                  const size = item.variant?.size?.size
                  const color = item.variant?.color?.color_name
                  // unit_price is the price snapshotted at purchase time.
                  const unitPrice = Number(item.unit_price)

                  return (
                    <li key={item.id} className="cart-item">
                      <span className="cart-item-name">{item.variant?.product?.name}</span>

                      {(size || color) && (
                        <span className="cart-item-variant">{[size, color].filter(Boolean).join(' / ')}</span>
                      )}

                      <span className="cart-item-quantity">Qty: {item.quantity}</span>
                      <span className="cart-item-unit-price">₹{unitPrice} each</span>
                      <span className="cart-item-subtotal">₹{unitPrice * item.quantity}</span>
                    </li>
                  )
                })}
              </ul>

              <p className="cart-total">Total: ₹{Number(order.total_amount)}</p>
            </section>

            <section className="order-payments-section">
              <h2>Payment</h2>

              {payError && (
                <p role="alert" className="order-message">
                  {payError}
                </p>
              )}
              {paySuccess && (
                <p role="status" className="order-message">
                  {paySuccess}
                </p>
              )}

              {canPayForOrder(order) && (
                <button
                  type="button"
                  className="order-button order-button-outline order-pay-button"
                  onClick={handlePayNow}
                  disabled={isPaying}
                >
                  {isPaying ? 'Processing...' : 'Pay Now'}
                </button>
              )}

              {order.payments && order.payments.length > 0 ? (
                <ul className="order-payment-list">
                  {order.payments.map((payment) => (
                    <li key={payment.id} className="order-payment-row">
                      <span className="order-payment-provider">{payment.provider}</span>
                      <span className="order-status">{payment.status}</span>
                      <span className="order-payment-amount">
                        {payment.currency} {payment.amount}
                      </span>
                      <span className="order-payment-date">
                        {new Date(payment.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="order-message">No payment attempts yet.</p>
              )}
            </section>

            <Link to="/products" className="order-button">
              Continue Shopping
            </Link>
          </>
        )}
      </main>
    </>
  )
}

export default OrderConfirmation
