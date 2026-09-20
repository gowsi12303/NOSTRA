import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import AddressForm from '../../components/customer/AddressForm'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

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
      <main>
        <h1>Your Addresses</h1>

        {isLoading && <p>Loading your addresses...</p>}

        {!isLoading && error && <p role="alert">{error}</p>}

        {!isLoading && !error && (
          <>
            {actionError && <p role="alert">{actionError}</p>}
            {actionSuccess && <p role="status">{actionSuccess}</p>}

            {addresses.length === 0 && <p>You have no saved addresses yet.</p>}

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

            <h2>Add New Address</h2>
            <AddressForm submitLabel="Add Address" onSubmit={handleCreate} />
          </>
        )}
      </main>
    </>
  )
}

export default Addresses
