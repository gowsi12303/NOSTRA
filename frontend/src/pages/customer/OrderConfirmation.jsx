import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

function OrderConfirmation() {
  const { id } = useParams()
  const { state } = useLocation()
  const { accessToken } = useAuth()

  const [order, setOrder] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <>
      <Navbar />
      <main>
        <h1>{state?.justPlaced ? 'Order Placed' : 'Order Details'}</h1>

        {isLoading && <p>Loading your order...</p>}

        {!isLoading && error && (
          <>
            <p role="alert">{error}</p>
            <Link to="/products">Browse Products</Link>
          </>
        )}

        {!isLoading && !error && order && (
          <>
            {state?.justPlaced && <p role="status">Thank you! Your order has been placed.</p>}

            <p className="order-number">Order number: {order.order_number}</p>
            <p className="order-status">Status: {order.status}</p>

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
                      <span className="cart-item-unit-price">₹{unitPrice}</span>
                      <span className="cart-item-subtotal">₹{unitPrice * item.quantity}</span>
                    </li>
                  )
                })}
              </ul>

              <p className="cart-total">Total: ₹{Number(order.total_amount)}</p>
            </section>

            <Link to="/products">Continue Shopping</Link>
          </>
        )}
      </main>
    </>
  )
}

export default OrderConfirmation
