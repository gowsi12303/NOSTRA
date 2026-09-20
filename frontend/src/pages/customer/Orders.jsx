import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

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
      <main>
        <h1>Your Orders</h1>

        {isLoading && <p>Loading your orders...</p>}

        {!isLoading && error && <p role="alert">{error}</p>}

        {!isLoading && !error && orders.length === 0 && (
          <>
            <p>You have not placed any orders yet.</p>
            <Link to="/products">Browse Products</Link>
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
                <Link to={`/orders/${order.id}`}>View Order</Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}

export default Orders
