import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

function Wishlist() {
  const { accessToken } = useAuth()
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Which wishlist item is currently being removed, and any error from
  // that action — kept separate from the initial-load state so a remove
  // failure doesn't blank out the whole page.
  const [pendingItemId, setPendingItemId] = useState(null)
  const [actionError, setActionError] = useState('')

  const fetchWishlist = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(ENDPOINTS.wishlist, { accessToken })
        .then((data) => setItems(data ?? []))
        .catch((err) => setError(err.message || 'Unable to load your wishlist.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken],
  )

  useEffect(() => {
    fetchWishlist()
  }, [fetchWishlist])

  async function removeItem(item) {
    setActionError('')
    setPendingItemId(item.id)
    try {
      await apiDelete(ENDPOINTS.wishlistItemDetail(item.id), { accessToken })
      await fetchWishlist({ silent: true })
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
        <h1>Your Wishlist</h1>

        {isLoading && <p>Loading your wishlist...</p>}

        {!isLoading && error && <p role="alert">{error}</p>}

        {!isLoading && !error && actionError && <p role="alert">{actionError}</p>}

        {!isLoading && !error && items.length === 0 && <p>Your wishlist is empty.</p>}

        {!isLoading && !error && items.length > 0 && (
          <ul className="wishlist-item-list">
            {items.map((item) => {
              const isPending = pendingItemId === item.id

              return (
                <li key={item.id} className="wishlist-item">
                  <Link to={`/products/${item.product?.id}`} className="wishlist-item-name">
                    {item.product?.name}
                  </Link>
                  <span className="wishlist-item-price">₹{item.product?.price}</span>

                  <button
                    type="button"
                    className="wishlist-item-remove"
                    onClick={() => removeItem(item)}
                    disabled={isPending}
                  >
                    {isPending ? 'Removing...' : 'Remove'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}

export default Wishlist
