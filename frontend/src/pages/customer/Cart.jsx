import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

function Cart() {
  const { accessToken } = useAuth()
  const [cart, setCart] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Which cart item is currently being updated/removed, and any error
  // from that specific action — kept separate from the initial-load
  // state above so an action failure doesn't blank out the whole page.
  const [pendingItemId, setPendingItemId] = useState(null)
  const [actionError, setActionError] = useState('')

  const fetchCart = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(ENDPOINTS.cart, { accessToken })
        .then((data) => setCart(data))
        .catch((err) => setError(err.message || 'Unable to load your cart.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken],
  )

  useEffect(() => {
    let cancelled = false

    fetchCart().then(() => {
      // fetchCart already guards its own state updates against a missing
      // accessToken; this just avoids a stray render after unmount.
      if (cancelled) return
    })

    return () => {
      cancelled = true
    }
  }, [fetchCart])

  const items = cart?.items ?? []

  // GET /api/products/cart/ doesn't return a per-item subtotal or a cart
  // total — CartSerializer/CartItemSerializer only expose quantity and
  // the variant, not a price on the cart item itself. Unit price and
  // subtotal are derived here (quantity x the variant's product price)
  // purely for display, not values the API sends.
  const itemsWithPricing = items.map((item) => {
    const unitPrice = Number(item.variant?.product?.price ?? 0)
    return { ...item, unitPrice, subtotal: unitPrice * item.quantity }
  })
  const cartTotal = itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0)

  async function updateQuantity(item, newQuantity) {
    if (newQuantity < 1) return

    setActionError('')
    setPendingItemId(item.id)
    try {
      await apiPatch(ENDPOINTS.cartItemDetail(item.id), { quantity: newQuantity }, { accessToken })
      // Refresh from the server rather than patching local state in
      // place — keeps quantity/stock/pricing display in sync with
      // whatever the backend actually persisted.
      await fetchCart({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to update this item.')
    } finally {
      setPendingItemId(null)
    }
  }

  async function removeItem(item) {
    setActionError('')
    setPendingItemId(item.id)
    try {
      await apiDelete(ENDPOINTS.cartItemDetail(item.id), { accessToken })
      await fetchCart({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to remove this item.')
    } finally {
      setPendingItemId(null)
    }
  }

  return (
    <>
      <Navbar />
      <main>
        <h1>Your Cart</h1>

        {isLoading && <p>Loading your cart...</p>}

        {!isLoading && error && <p role="alert">{error}</p>}

        {!isLoading && !error && actionError && <p role="alert">{actionError}</p>}

        {!isLoading && !error && items.length === 0 && <p>Your cart is empty.</p>}

        {!isLoading && !error && items.length > 0 && (
          <>
            <ul className="cart-item-list">
              {itemsWithPricing.map((item) => {
                const size = item.variant?.size?.size
                const color = item.variant?.color?.color_name
                const isPending = pendingItemId === item.id

                return (
                  <li key={item.id} className="cart-item">
                    <span className="cart-item-name">{item.variant?.product?.name}</span>

                    {(size || color) && (
                      <span className="cart-item-variant">
                        {[size, color].filter(Boolean).join(' / ')}
                      </span>
                    )}

                    <span className="cart-item-quantity-controls">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item, item.quantity - 1)}
                        disabled={isPending || item.quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="cart-item-quantity">
                        {isPending ? '...' : `Qty: ${item.quantity}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item, item.quantity + 1)}
                        disabled={isPending}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </span>

                    <span className="cart-item-unit-price">₹{item.unitPrice}</span>
                    <span className="cart-item-subtotal">₹{item.subtotal}</span>

                    <button
                      type="button"
                      className="cart-item-remove"
                      onClick={() => removeItem(item)}
                      disabled={isPending}
                    >
                      {isPending ? 'Removing...' : 'Remove'}
                    </button>
                  </li>
                )
              })}
            </ul>

            <p className="cart-total">Total: ₹{cartTotal}</p>

            <Link to="/checkout">Proceed to Checkout</Link>
          </>
        )}
      </main>
    </>
  )
}

export default Cart
