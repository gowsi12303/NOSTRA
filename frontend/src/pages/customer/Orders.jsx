import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Page styles, scoped under `.orders-page`. Rendered through a <style> with
// `href` + `precedence` so React 19 hoists it into the document head once.
// Colors use light-dark() to follow the app's `color-scheme: light dark`,
// matching the rest of the customer pages.
const ordersStyles = `
  .orders-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .orders-page .orders-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  /* Loading, empty and error messages. */
  .orders-page .orders-message {
    margin: 0 0 16px;
    line-height: 1.6;
  }

  .orders-page .orders-empty {
    padding: 48px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    opacity: 0.75;
    text-align: center;
  }

  .orders-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  /* Outlined secondary button style, shared by the empty-state link and
     each order's View Order link. */
  .orders-page .orders-button {
    display: inline-block;
    padding: 12px 24px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
    white-space: nowrap;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .orders-page .orders-button:hover,
  .orders-page .orders-button:focus-visible {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .orders-page .order-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One card per order. Order number and date stack in the first column;
     status, total and the View Order link each get their own column. */
  .orders-page .order-list-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 24px;
    padding: 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .orders-page .order-list-item:hover,
  .orders-page .order-list-item:focus-within {
    border-color: light-dark(#111111, #f5f5f5);
    box-shadow: 0 8px 20px light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.6));
  }

  .orders-page .order-number {
    grid-column: 1;
    grid-row: 1;
    align-self: end;
    font-size: 1.05rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
  }

  .orders-page .order-date {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    margin-top: 4px;
    font-size: 0.85rem;
    opacity: 0.65;
  }

  .orders-page .order-status {
    grid-column: 2;
    grid-row: 1 / span 2;
    padding: 4px 12px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .orders-page .order-total {
    grid-column: 3;
    grid-row: 1 / span 2;
    font-size: 1.05rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .orders-page .order-list-item .orders-button {
    grid-column: 4;
    grid-row: 1 / span 2;
  }

  /* Small screens: the order number gets the full top row (it is long and
     would wrap if it shared the row); the date and status share the next
     row, and the total and View Order link share the last row. */
  @media (max-width: 600px) {
    .orders-page {
      padding: 24px 16px 48px;
    }

    .orders-page .order-list-item {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: none;
      /* No row-gap: spacing comes from margins so nothing is doubled. */
      row-gap: 0;
      padding: 16px;
    }

    .orders-page .order-number {
      grid-column: 1 / -1;
      grid-row: 1;
      align-self: center;
    }

    .orders-page .order-date {
      grid-column: 1;
      grid-row: 2;
      align-self: center;
      margin-top: 8px;
    }

    .orders-page .order-status {
      grid-column: 2;
      grid-row: 2;
      margin-top: 8px;
    }

    .orders-page .order-total {
      grid-column: 1;
      grid-row: 3;
      margin-top: 12px;
    }

    .orders-page .order-list-item .orders-button {
      grid-column: 2;
      grid-row: 3;
      margin-top: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orders-page .order-list-item,
    .orders-page .orders-button {
      transition: none;
    }
  }
`

function Orders() {
  const { accessToken } = useAuth()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false
    setIsLoading(true)
    setError('')

    // GET /api/products/orders/ returns a plain (unpaginated) array,
    // newest first.
    apiGet(ENDPOINTS.orders, { accessToken })
      .then((data) => {
        if (!cancelled) setOrders(data ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load your orders.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  return (
    <>
      <Navbar />
      <style href="orders-styles" precedence="default">
        {ordersStyles}
      </style>
      <main className="orders-page">
        <h1 className="orders-title">Your Orders</h1>

        {isLoading && <p className="orders-message">Loading your orders...</p>}

        {!isLoading && error && (
          <p role="alert" className="orders-message">
            {error}
          </p>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <>
            <p className="orders-message orders-empty">You have not placed any orders yet.</p>
            <Link to="/products" className="orders-button">
              Browse Products
            </Link>
          </>
        )}

        {!isLoading && !error && orders.length > 0 && (
          <ul className="order-list">
            {orders.map((order) => (
              <li key={order.id} className="order-list-item">
                <span className="order-number">{order.order_number}</span>
                <span className="order-status">Status: {order.status}</span>
                <span className="order-date">{new Date(order.created_at).toLocaleString()}</span>
                <span className="order-total">Total: ₹{Number(order.total_amount)}</span>
                <Link to={`/orders/${order.id}`} className="orders-button">
                  View Order
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}

export default Orders
