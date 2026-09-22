import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import AddressForm from '../../components/customer/AddressForm'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Page styles, scoped under `.checkout-page`. This includes the descendant
// rules that style AddressForm's fields (shown inline when the user has no
// saved addresses), so AddressForm.jsx itself stays untouched. Rendered
// through a <style> with `href` + `precedence` so React 19 hoists it into the
// document head once. Colors use light-dark() to follow the app's
// `color-scheme: light dark`, matching the rest of the customer pages.
const checkoutStyles = `
  .checkout-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .checkout-page .checkout-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  /* Loading, empty-cart, error and note messages. */
  .checkout-page .checkout-message {
    margin: 0 0 16px;
    line-height: 1.6;
  }

  .checkout-page .checkout-empty {
    padding: 48px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    opacity: 0.75;
    text-align: center;
  }

  .checkout-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .checkout-page [role='alert'] a {
    color: inherit;
  }

  /* Outlined secondary link, used by the empty-cart state. */
  .checkout-page .checkout-button-outline {
    display: inline-block;
    padding: 12px 24px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    color: light-dark(#111111, #f5f5f5);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-decoration: none;
    text-transform: uppercase;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .checkout-page .checkout-button-outline:hover,
  .checkout-page .checkout-button-outline:focus-visible {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  /* Shipping Address and Order Summary, each a card. */
  .checkout-page .checkout-address-section,
  .checkout-page .checkout-summary-section {
    margin-bottom: 24px;
    padding: 24px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .checkout-page .checkout-address-section h2,
  .checkout-page .checkout-summary-section h2 {
    margin: 0 0 16px;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .checkout-page .checkout-note {
    margin: 0 0 16px;
    line-height: 1.6;
    opacity: 0.75;
  }

  /* Saved addresses as selectable option cards. The whole card is the
     radio's label, so it is clickable anywhere; the selected card gets a
     heavier border. */
  .checkout-page .address-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .checkout-page .address-list-item {
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .checkout-page .address-list-item:hover,
  .checkout-page .address-list-item:focus-within {
    border-color: light-dark(#111111, #f5f5f5);
  }

  .checkout-page .address-list-item:has(input:checked) {
    border-color: light-dark(#111111, #f5f5f5);
    box-shadow: 0 0 0 1px light-dark(#111111, #f5f5f5);
  }

  .checkout-page .address-list-item label {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 14px;
    align-items: start;
    padding: 16px;
    cursor: pointer;
  }

  .checkout-page .address-list-item input[type='radio'] {
    grid-column: 1;
    grid-row: 1 / span 5;
    width: 18px;
    height: 18px;
    margin: 3px 0 0;
    accent-color: light-dark(#111111, #f5f5f5);
    cursor: pointer;
  }

  .checkout-page .address-list-item label span {
    grid-column: 2;
    line-height: 1.6;
  }

  .checkout-page .address-list-item .address-name {
    margin-bottom: 4px;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .checkout-page .address-list-item .address-name strong {
    margin-left: 6px;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.15em;
    opacity: 0.65;
    text-transform: uppercase;
  }

  .checkout-page .address-list-item .address-phone,
  .checkout-page .address-list-item .address-lines,
  .checkout-page .address-list-item .address-region,
  .checkout-page .address-list-item .address-country {
    font-size: 0.9rem;
    opacity: 0.75;
  }

  /* AddressForm, when the user has no saved addresses. */
  .checkout-page .address-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 560px;
  }

  .checkout-page .address-form label {
    margin-top: 8px;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .checkout-page .address-form input:not([type='checkbox']) {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .checkout-page .address-form input:not([type='checkbox']):focus-visible,
  .checkout-page .address-form input[type='checkbox']:focus-visible {
    outline: 2px solid light-dark(#111111, #f5f5f5);
    outline-offset: 1px;
  }

  .checkout-page .address-form label[for='is_default'] {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    font-size: 0.9rem;
    letter-spacing: normal;
    text-transform: none;
    cursor: pointer;
  }

  .checkout-page .address-form input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: light-dark(#111111, #f5f5f5);
    cursor: pointer;
  }

  .checkout-page .address-form p {
    margin: 8px 0 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .checkout-page .address-form button[type='submit'] {
    margin-top: 16px;
    padding: 14px 24px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
    font: inherit;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .checkout-page .address-form button[type='submit']:hover:not(:disabled),
  .checkout-page .address-form button[type='submit']:focus-visible:not(:disabled) {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .checkout-page .address-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Order Summary rows: name and variant stack in the first column;
     quantity, unit price and line subtotal each get their own column. */
  .checkout-page .cart-item-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .checkout-page .cart-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 110px 100px;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 24px;
    padding: 16px 0;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .checkout-page .cart-item:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .checkout-page .cart-item-name {
    grid-column: 1;
    grid-row: 1;
    align-self: end;
    font-weight: 500;
    line-height: 1.4;
  }

  .checkout-page .cart-item-variant {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
    margin-top: 4px;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    opacity: 0.65;
    text-transform: uppercase;
  }

  .checkout-page .cart-item-quantity {
    grid-column: 2;
    grid-row: 1 / span 2;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .checkout-page .cart-item-unit-price {
    grid-column: 3;
    grid-row: 1 / span 2;
    font-size: 0.9rem;
    opacity: 0.7;
    text-align: right;
    white-space: nowrap;
  }

  .checkout-page .cart-item-subtotal {
    grid-column: 4;
    grid-row: 1 / span 2;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }

  /* Total: prominent, under a heavy rule. */
  .checkout-page .cart-total {
    margin: 8px 0 0;
    padding-top: 20px;
    border-top: 2px solid light-dark(#111111, #f5f5f5);
    font-size: clamp(1.4rem, 4vw, 1.9rem);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-align: right;
  }

  /* Primary: Place Order. */
  .checkout-page .checkout-place-order {
    display: block;
    width: 100%;
    padding: 18px 24px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
    font: inherit;
    font-size: 0.95rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .checkout-page .checkout-place-order:hover:not(:disabled),
  .checkout-page .checkout-place-order:focus-visible:not(:disabled) {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .checkout-page .checkout-place-order:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .checkout-page {
      padding: 24px 16px 48px;
    }

    .checkout-page .checkout-address-section,
    .checkout-page .checkout-summary-section {
      padding: 20px 16px;
    }

    /* Two-column item rows: name and variant span the top; quantity and
       subtotal share the next row; unit price sits under the quantity. */
    .checkout-page .cart-item {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: none;
      /* No row-gap: the variant row is absent for items without a size or
         color, so spacing comes from margins to avoid a doubled gap. */
      row-gap: 0;
    }

    .checkout-page .cart-item-name {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .checkout-page .cart-item-variant {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .checkout-page .cart-item-quantity {
      grid-column: 1;
      grid-row: 3;
      margin-top: 8px;
    }

    .checkout-page .cart-item-subtotal {
      grid-column: 2;
      grid-row: 3;
      margin-top: 8px;
    }

    .checkout-page .cart-item-unit-price {
      grid-column: 1 / -1;
      grid-row: 4;
      margin-top: 4px;
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .checkout-page .address-list-item,
    .checkout-page .checkout-button-outline,
    .checkout-page .address-form button,
    .checkout-page .checkout-place-order {
      transition: none;
    }
  }
`

function Checkout() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()

  const [cart, setCart] = useState(null)
  const [addresses, setAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Kept separate from the load state above so a failed Place Order
  // doesn't blank out the page — the user can fix things and retry.
  const [isPlacing, setIsPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')

  const fetchAddresses = useCallback(
    () => apiGet(ENDPOINTS.addresses, { accessToken }).then((data) => data ?? []),
    [accessToken],
  )

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false
    setIsLoading(true)
    setError('')

    Promise.all([apiGet(ENDPOINTS.cart, { accessToken }), fetchAddresses()])
      .then(([cartData, addressData]) => {
        if (cancelled) return
        setCart(cartData)
        setAddresses(addressData)
        // Preselect the default address (the API lists it first); fall
        // back to the first address if none is flagged default.
        const preselected = addressData.find((address) => address.is_default) ?? addressData[0]
        setSelectedAddressId(preselected?.id ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load checkout.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, fetchAddresses])

  const items = cart?.items ?? []

  // Same display-only derivation as Cart.jsx: the cart API returns no
  // per-item subtotal or total. The backend recomputes the real total from
  // current prices when the order is placed.
  const itemsWithPricing = items.map((item) => {
    const unitPrice = Number(item.variant?.product?.price ?? 0)
    return { ...item, unitPrice, subtotal: unitPrice * item.quantity }
  })
  const cartTotal = itemsWithPricing.reduce((sum, item) => sum + item.subtotal, 0)

  // Only reached when the user has no addresses yet. AddressForm shows any
  // failure here inline on the form, so nothing to catch.
  async function handleCreateAddress(formData) {
    const created = await apiPost(ENDPOINTS.addresses, formData, { accessToken })
    setAddresses(await fetchAddresses())
    setSelectedAddressId(created.id)
  }

  async function handlePlaceOrder() {
    if (!selectedAddressId || isPlacing) return

    setPlaceError('')
    setIsPlacing(true)
    try {
      const order = await apiPost(
        ENDPOINTS.orderPlace,
        { address_id: selectedAddressId },
        { accessToken },
      )
      navigate(`/orders/${order.id}`, { state: { justPlaced: true } })
    } catch (err) {
      setPlaceError(err.message || 'Unable to place your order.')
      setIsPlacing(false)
    }
  }

  return (
    <>
      <Navbar />
      <style href="checkout-styles" precedence="default">
        {checkoutStyles}
      </style>
      <main className="checkout-page">
        <h1 className="checkout-title">Checkout</h1>

        {isLoading && <p className="checkout-message">Loading checkout...</p>}

        {!isLoading && error && (
          <p role="alert" className="checkout-message">
            {error}
          </p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <>
            <p className="checkout-message checkout-empty">Your cart is empty.</p>
            <Link to="/products" className="checkout-button-outline">
              Browse Products
            </Link>
          </>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <section className="checkout-address-section">
              <h2>Shipping Address</h2>

              {addresses.length === 0 && (
                <>
                  <p className="checkout-note">You have no saved addresses. Add one to continue.</p>
                  <AddressForm submitLabel="Save Address" onSubmit={handleCreateAddress} />
                </>
              )}

              {addresses.length > 0 && (
                <ul className="address-list">
                  {addresses.map((address) => (
                    <li key={address.id} className="address-list-item">
                      <label htmlFor={`address-${address.id}`}>
                        <input
                          id={`address-${address.id}`}
                          type="radio"
                          name="address"
                          value={address.id}
                          checked={selectedAddressId === address.id}
                          onChange={() => setSelectedAddressId(address.id)}
                          disabled={isPlacing}
                        />
                        <span className="address-name">
                          {address.full_name} {address.is_default && <strong>(Default)</strong>}
                        </span>
                        <span className="address-phone">{address.phone}</span>
                        <span className="address-lines">
                          {address.address_line1}
                          {address.address_line2 ? `, ${address.address_line2}` : ''}
                        </span>
                        <span className="address-region">
                          {address.city}, {address.state} {address.postal_code}
                        </span>
                        <span className="address-country">{address.country}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="checkout-summary-section">
              <h2>Order Summary</h2>

              <ul className="cart-item-list">
                {itemsWithPricing.map((item) => {
                  const size = item.variant?.size?.size
                  const color = item.variant?.color?.color_name

                  return (
                    <li key={item.id} className="cart-item">
                      <span className="cart-item-name">{item.variant?.product?.name}</span>

                      {(size || color) && (
                        <span className="cart-item-variant">{[size, color].filter(Boolean).join(' / ')}</span>
                      )}

                      <span className="cart-item-quantity">Qty: {item.quantity}</span>
                      <span className="cart-item-unit-price">₹{item.unitPrice} each</span>
                      <span className="cart-item-subtotal">₹{item.subtotal}</span>
                    </li>
                  )
                })}
              </ul>

              <p className="cart-total">Total: ₹{cartTotal}</p>
            </section>

            {placeError && (
              <p role="alert" className="checkout-message">
                {placeError} <Link to="/cart">Review your cart</Link>
              </p>
            )}

            <button
              type="button"
              className="checkout-place-order"
              onClick={handlePlaceOrder}
              disabled={isPlacing || !selectedAddressId}
            >
              {isPlacing ? 'Placing order...' : 'Place Order'}
            </button>
          </>
        )}
      </main>
    </>
  )
}

export default Checkout
