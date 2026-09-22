import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Page styles, scoped under `.wishlist-page`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's
// `color-scheme: light dark`, matching Navbar, Home, Products and
// ProductDetail.
const wishlistStyles = `
  .wishlist-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .wishlist-page .wishlist-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  /* Loading, empty, and error/success messages. */
  .wishlist-page .wishlist-message {
    margin: 0 0 16px;
    line-height: 1.6;
  }

  .wishlist-page .wishlist-empty {
    padding: 48px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    opacity: 0.75;
    text-align: center;
  }

  .wishlist-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .wishlist-page [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  .wishlist-page .wishlist-item-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .wishlist-page .wishlist-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    padding: 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .wishlist-page .wishlist-item:hover,
  .wishlist-page .wishlist-item:focus-within {
    border-color: light-dark(#111111, #f5f5f5);
    box-shadow: 0 8px 20px light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.6));
  }

  .wishlist-page .wishlist-item-name {
    flex: 1 1 200px;
    color: inherit;
    font-size: 1.05rem;
    font-weight: 500;
    line-height: 1.4;
    text-decoration: none;
    text-underline-offset: 4px;
  }

  /* text-decoration (not a border) so the underline hugs the words rather
     than spanning the whole flex item. */
  .wishlist-page .wishlist-item-name:hover,
  .wishlist-page .wishlist-item-name:focus-visible {
    text-decoration: underline;
  }

  .wishlist-page .wishlist-item-price {
    font-size: 1rem;
    opacity: 0.75;
    white-space: nowrap;
  }

  .wishlist-page .wishlist-item-remove {
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

  .wishlist-page .wishlist-item-remove:hover:not(:disabled),
  .wishlist-page .wishlist-item-remove:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .wishlist-page .wishlist-item-remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Small screens: the name takes its own row, and the price and Remove
     button share the row beneath it, with Remove pushed to the right. */
  @media (max-width: 480px) {
    .wishlist-page {
      padding: 24px 16px 48px;
    }

    .wishlist-page .wishlist-item {
      padding: 16px;
    }

    .wishlist-page .wishlist-item-name {
      flex: 1 1 100%;
    }

    .wishlist-page .wishlist-item-remove {
      margin-left: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wishlist-page .wishlist-item,
    .wishlist-page .wishlist-item-remove {
      transition: none;
    }
  }
`

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
      <style href="wishlist-styles" precedence="default">
        {wishlistStyles}
      </style>
      <main className="wishlist-page">
        <h1 className="wishlist-title">Your Wishlist</h1>

        {isLoading && <p className="wishlist-message">Loading your wishlist...</p>}

        {!isLoading && error && (
          <p role="alert" className="wishlist-message">
            {error}
          </p>
        )}

        {!isLoading && !error && actionError && (
          <p role="alert" className="wishlist-message">
            {actionError}
          </p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <p className="wishlist-message wishlist-empty">Your wishlist is empty.</p>
        )}

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
