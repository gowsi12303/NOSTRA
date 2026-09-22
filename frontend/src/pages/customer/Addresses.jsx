import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import AddressForm from '../../components/customer/AddressForm'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Page styles, scoped under `.addresses-page`. This includes the descendant
// rules that style AddressForm's fields and buttons, so AddressForm itself
// stays untouched and Checkout (which reuses `address-list*` class names and
// AddressForm) is not affected. Rendered through a <style> with `href` +
// `precedence` so React 19 hoists it into the document head once. Colors use
// light-dark() to follow the app's `color-scheme: light dark`, matching
// Navbar, Home, Products, ProductDetail, Wishlist and Cart.
const addressesStyles = `
  .addresses-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .addresses-page .addresses-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .addresses-page .addresses-section-title {
    margin: 48px 0 20px;
    padding-top: 24px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  /* Loading, empty, error and success messages. */
  .addresses-page .addresses-message {
    margin: 0 0 16px;
    line-height: 1.6;
  }

  .addresses-page .addresses-empty {
    padding: 48px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    opacity: 0.75;
    text-align: center;
  }

  .addresses-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .addresses-page [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  /* Address cards. */
  .addresses-page .address-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .addresses-page .address-list-item {
    padding: 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .addresses-page .address-list-item:hover,
  .addresses-page .address-list-item:focus-within {
    border-color: light-dark(#111111, #f5f5f5);
    box-shadow: 0 8px 20px light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.6));
  }

  .addresses-page .address-list-item p {
    margin: 0;
    line-height: 1.6;
  }

  .addresses-page .address-list-item .address-name {
    margin-bottom: 4px;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .addresses-page .address-name strong {
    margin-left: 6px;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.15em;
    opacity: 0.65;
    text-transform: uppercase;
  }

  .addresses-page .address-phone,
  .addresses-page .address-lines,
  .addresses-page .address-region,
  .addresses-page .address-country {
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .addresses-page .address-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  /* Outlined secondary buttons: card actions and the form's Cancel. */
  .addresses-page .address-actions button,
  .addresses-page .address-form button[type='button'] {
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

  .addresses-page .address-actions button:hover:not(:disabled),
  .addresses-page .address-actions button:focus-visible:not(:disabled),
  .addresses-page .address-form button[type='button']:hover:not(:disabled),
  .addresses-page .address-form button[type='button']:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .addresses-page .address-actions button:disabled,
  .addresses-page .address-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* The form (add, and edit-in-place inside a card). */
  .addresses-page .address-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 560px;
  }

  .addresses-page .address-form label {
    margin-top: 8px;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .addresses-page .address-form input:not([type='checkbox']) {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .addresses-page .address-form input:not([type='checkbox']):focus-visible,
  .addresses-page .address-form input[type='checkbox']:focus-visible {
    outline: 2px solid light-dark(#111111, #f5f5f5);
    outline-offset: 1px;
  }

  /* The "Set as default address" label wraps its checkbox, so it gets a
     sentence-case inline layout instead of the uppercase field-label look. */
  .addresses-page .address-form label[for='is_default'] {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    font-size: 0.9rem;
    letter-spacing: normal;
    text-transform: none;
    cursor: pointer;
  }

  .addresses-page .address-form input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: light-dark(#111111, #f5f5f5);
    cursor: pointer;
  }

  .addresses-page .address-form p {
    margin: 8px 0 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* Primary: Add Address / Save Changes */
  .addresses-page .address-form button[type='submit'] {
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

  .addresses-page .address-form button[type='submit']:hover:not(:disabled),
  .addresses-page .address-form button[type='submit']:focus-visible:not(:disabled) {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .addresses-page .address-form button[type='button'] {
    padding: 12px 20px;
  }

  @media (max-width: 480px) {
    .addresses-page {
      padding: 24px 16px 48px;
    }

    .addresses-page .address-list-item {
      padding: 16px;
    }

    .addresses-page .address-actions button {
      flex: 1 1 auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .addresses-page .address-list-item,
    .addresses-page .address-actions button,
    .addresses-page .address-form button {
      transition: none;
    }
  }
`

function Addresses() {
  const { accessToken } = useAuth()
  const [addresses, setAddresses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Which address is currently mid-edit, or mid set-default/delete, plus
  // feedback for the actions that don't already have their own form
  // (AddressForm shows its own error for create/edit).
  const [editingId, setEditingId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  const fetchAddresses = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(ENDPOINTS.addresses, { accessToken })
        .then((data) => setAddresses(data ?? []))
        .catch((err) => setError(err.message || 'Unable to load your addresses.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken],
  )

  useEffect(() => {
    fetchAddresses()
  }, [fetchAddresses])

  async function handleCreate(formData) {
    setActionError('')
    setActionSuccess('')
    // Any failure here propagates back to AddressForm's own try/catch,
    // which shows it inline on the form — nothing to catch here.
    await apiPost(ENDPOINTS.addresses, formData, { accessToken })
    setActionSuccess('Address added.')
    await fetchAddresses({ silent: true })
  }

  async function handleUpdate(id, formData) {
    setActionError('')
    setActionSuccess('')
    await apiPatch(ENDPOINTS.addressDetail(id), formData, { accessToken })
    setActionSuccess('Address updated.')
    setEditingId(null)
    await fetchAddresses({ silent: true })
  }

  async function handleSetDefault(address) {
    setActionError('')
    setActionSuccess('')
    setPendingId(address.id)
    try {
      await apiPatch(ENDPOINTS.addressDetail(address.id), { is_default: true }, { accessToken })
      setActionSuccess('Default address updated.')
      await fetchAddresses({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to set this address as default.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(address) {
    setActionError('')
    setActionSuccess('')
    setPendingId(address.id)
    try {
      await apiDelete(ENDPOINTS.addressDetail(address.id), { accessToken })
      setActionSuccess('Address removed.')
      await fetchAddresses({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to remove this address.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <>
      <Navbar />
      <style href="addresses-styles" precedence="default">
        {addressesStyles}
      </style>
      <main className="addresses-page">
        <h1 className="addresses-title">Your Addresses</h1>

        {isLoading && <p className="addresses-message">Loading your addresses...</p>}

        {!isLoading && error && (
          <p role="alert" className="addresses-message">
            {error}
          </p>
        )}

        {!isLoading && !error && (
          <>
            {actionError && (
              <p role="alert" className="addresses-message">
                {actionError}
              </p>
            )}
            {actionSuccess && (
              <p role="status" className="addresses-message">
                {actionSuccess}
              </p>
            )}

            {addresses.length === 0 && (
              <p className="addresses-message addresses-empty">You have no saved addresses yet.</p>
            )}

            {addresses.length > 0 && (
              <ul className="address-list">
                {addresses.map((address) => {
                  const isPending = pendingId === address.id

                  if (editingId === address.id) {
                    return (
                      <li key={address.id} className="address-list-item">
                        <AddressForm
                          initialValues={address}
                          submitLabel="Save Changes"
                          onCancel={() => setEditingId(null)}
                          onSubmit={(formData) => handleUpdate(address.id, formData)}
                        />
                      </li>
                    )
                  }

                  return (
                    <li key={address.id} className="address-list-item">
                      <p className="address-name">
                        {address.full_name} {address.is_default && <strong>(Default)</strong>}
                      </p>
                      <p className="address-phone">{address.phone}</p>
                      <p className="address-lines">
                        {address.address_line1}
                        {address.address_line2 ? `, ${address.address_line2}` : ''}
                      </p>
                      <p className="address-region">
                        {address.city}, {address.state} {address.postal_code}
                      </p>
                      <p className="address-country">{address.country}</p>

                      <div className="address-actions">
                        <button type="button" onClick={() => setEditingId(address.id)} disabled={isPending}>
                          Edit
                        </button>

                        {!address.is_default && (
                          <button type="button" onClick={() => handleSetDefault(address)} disabled={isPending}>
                            {isPending ? 'Updating...' : 'Set as Default'}
                          </button>
                        )}

                        <button type="button" onClick={() => handleDelete(address)} disabled={isPending}>
                          {isPending ? 'Removing...' : 'Delete'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <h2 className="addresses-section-title">Add New Address</h2>
            <AddressForm submitLabel="Add Address" onSubmit={handleCreate} />
          </>
        )}
      </main>
    </>
  )
}

export default Addresses
