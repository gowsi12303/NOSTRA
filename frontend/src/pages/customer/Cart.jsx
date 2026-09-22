import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Page styles, scoped under `.cart-page` (Checkout and OrderConfirmation
// reuse some `cart-item*` class names, so nothing here may leak out of it).
// Rendered through a <style> with `href` + `precedence` so React 19 hoists
// it into the document head once. Colors use light-dark() to follow the
// app's `color-scheme: light dark`, matching Navbar, Home, Products,
// ProductDetail and Wishlist.
const cartStyles = `
  .cart-page {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .cart-page .cart-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  /* Loading, empty, and error messages. */
  .cart-page .cart-message {
    margin: 0 0 16px;
    line-height: 1.6;
  }

  .cart-page .cart-empty {
    padding: 48px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    opacity: 0.75;
    text-align: center;
  }

  .cart-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .cart-page .cart-item-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One row per item. Name and variant stack in the first column; the
     quantity controls, unit price, line subtotal and Remove button each
     get their own column, spanning both of the name/variant rows. */
  .cart-page .cart-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 100px 100px auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 24px;
    padding: 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .cart-page .cart-item:hover,
  .cart-page .cart-item:focus-within {
    border-color: light-dark(#111111, #f5f5f5);
    box-shadow: 0 8px 20px light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.6));
  }

  .cart-page .cart-item-name {
    grid-column: 1;
    grid-row: 1;
    align-self: end;
    font-size: 1.05rem;
    font-weight: 500;
    line-height: 1.4;
  }

  .cart-page .cart-item-variant {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    margin-top: 4px;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    opacity: 0.65;
    text-transform: uppercase;
  }

  .cart-page .cart-item-quantity-controls {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: inline-flex;
    align-items: center;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
  }

  .cart-page .cart-item-quantity-controls button {
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    background-color: transparent;
    color: inherit;
    font: inherit;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .cart-page .cart-item-quantity-controls button:hover:not(:disabled),
  .cart-page .cart-item-quantity-controls button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .cart-page .cart-item-quantity-controls button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .cart-page .cart-item-quantity {
    min-width: 64px;
    padding: 0 8px;
    font-size: 0.85rem;
    text-align: center;
    white-space: nowrap;
  }

  .cart-page .cart-item-unit-price {
    grid-column: 3;
    grid-row: 1 / span 2;
    font-size: 0.9rem;
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
  }

  .cart-page .cart-item-subtotal {
    grid-column: 4;
    grid-row: 1 / span 2;
    font-size: 1.05rem;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }

  .cart-page .cart-item-remove {
    grid-column: 5;
    grid-row: 1 / span 2;
    padding: 10px 20px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .cart-page .cart-item-remove:hover:not(:disabled),
  .cart-page .cart-item-remove:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .cart-page .cart-item-remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cart-page .cart-summary {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 20px;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 2px solid light-dark(#111111, #f5f5f5);
  }

  .cart-page .cart-total {
    margin: 0;
    font-size: clamp(1.4rem, 4vw, 1.9rem);
    font-weight: 500;
    letter-spacing: 0.08em;
  }

  .cart-page .cart-checkout {
    display: inline-block;
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

  .cart-page .cart-checkout:hover,
  .cart-page .cart-checkout:focus-visible {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  /* Tablet and below: a two-column card. Name and variant span the top;
     quantity controls and subtotal share the next row; unit price and
     Remove share the last. */
  @media (max-width: 720px) {
    .cart-page .cart-item {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: none;
      /* No row-gap: the variant row is absent for items without a size or
         color, and a gap would still be added around that empty row.
         Spacing comes from margins on the rows below instead. */
      row-gap: 0;
    }

    .cart-page .cart-item-name {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .cart-page .cart-item-variant {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .cart-page .cart-item-quantity-controls {
      grid-column: 1;
      grid-row: 3;
      justify-self: start;
      margin-top: 12px;
    }

    .cart-page .cart-item-subtotal {
      grid-column: 2;
      grid-row: 3;
      margin-top: 12px;
    }

    .cart-page .cart-item-unit-price {
      grid-column: 1;
      grid-row: 4;
      margin-top: 12px;
      text-align: left;
    }

    .cart-page .cart-item-remove {
      grid-column: 2;
      grid-row: 4;
      margin-top: 12px;
    }
  }

  @media (max-width: 480px) {
    .cart-page {
      padding: 24px 16px 48px;
    }

    .cart-page .cart-item {
      padding: 16px;
    }

    .cart-page .cart-summary {
      align-items: stretch;
    }

    .cart-page .cart-total {
      text-align: right;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cart-page .cart-item,
    .cart-page .cart-item-quantity-controls button,
    .cart-page .cart-item-remove,
    .cart-page .cart-checkout {
      transition: none;
    }
  }
`

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
      <style href="cart-styles" precedence="default">
        {cartStyles}
      </style>
      <main className="cart-page">
        <h1 className="cart-title">Your Cart</h1>

        {isLoading && <p className="cart-message">Loading your cart...</p>}

        {!isLoading && error && (
          <p role="alert" className="cart-message">
            {error}
          </p>
        )}

        {!isLoading && !error && actionError && (
          <p role="alert" className="cart-message">
            {actionError}
          </p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <p className="cart-message cart-empty">Your cart is empty.</p>
        )}

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

                    <span className="cart-item-unit-price">₹{item.unitPrice} each</span>
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

            <div className="cart-summary">
              <p className="cart-total">Total: ₹{cartTotal}</p>

              <Link to="/checkout" className="cart-checkout">
                Proceed to Checkout
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  )
}

export default Cart
