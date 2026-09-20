import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import AddressForm from '../../components/customer/AddressForm'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

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
      <main>
        <h1>Checkout</h1>

        {isLoading && <p>Loading checkout...</p>}

        {!isLoading && error && <p role="alert">{error}</p>}

        {!isLoading && !error && items.length === 0 && (
          <>
            <p>Your cart is empty.</p>
            <Link to="/products">Browse Products</Link>
          </>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <section className="checkout-address-section">
              <h2>Shipping Address</h2>

              {addresses.length === 0 && (
                <>
                  <p>You have no saved addresses. Add one to continue.</p>
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
                      <span className="cart-item-unit-price">₹{item.unitPrice}</span>
                      <span className="cart-item-subtotal">₹{item.subtotal}</span>
                    </li>
                  )
                })}
              </ul>

              <p className="cart-total">Total: ₹{cartTotal}</p>
            </section>

            {placeError && (
              <p role="alert">
                {placeError} <Link to="/cart">Review your cart</Link>
              </p>
            )}

            <button type="button" onClick={handlePlaceOrder} disabled={isPlacing || !selectedAddressId}>
              {isPlacing ? 'Placing order...' : 'Place Order'}
            </button>
          </>
        )}
      </main>
    </>
  )
}

export default Checkout
