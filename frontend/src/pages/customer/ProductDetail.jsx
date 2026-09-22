import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

// Page styles, scoped under `.product-detail-page`. Rendered through a
// <style> with `href` + `precedence` so React 19 hoists it into the document
// head once. Colors use light-dark() to follow the app's
// `color-scheme: light dark`, matching Navbar, Home and Products.
const productDetailStyles = `
  .product-detail-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 16px 64px;
  }

  .product-detail-page .product-detail-back {
    display: inline-block;
    margin-bottom: 24px;
    padding: 6px 0;
    border-bottom: 1px solid transparent;
    color: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.15em;
    opacity: 0.7;
    text-decoration: none;
    text-transform: uppercase;
    transition: opacity 0.2s ease, border-color 0.2s ease;
  }

  .product-detail-page .product-detail-back:hover,
  .product-detail-page .product-detail-back:focus-visible {
    border-bottom-color: currentColor;
    opacity: 1;
  }

  .product-detail-page .product-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .product-detail-page .product-detail-title {
    margin: 0;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.1em;
    line-height: 1.2;
  }

  .product-detail-page .product-detail-category {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.2em;
    opacity: 0.6;
    text-transform: uppercase;
  }

  .product-detail-page .product-detail-images {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 12px;
  }

  .product-detail-page .product-detail-images img {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
  }

  .product-detail-page .product-detail-price {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 500;
  }

  .product-detail-page .product-detail-description {
    margin: 0;
    line-height: 1.7;
    opacity: 0.8;
  }

  .product-detail-page .product-detail h2 {
    margin: 0 0 10px;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .product-detail-page .product-detail-sizes,
  .product-detail-page .product-detail-colors {
    padding-top: 16px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .product-detail-page .product-detail-sizes ul,
  .product-detail-page .product-detail-colors ul {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .product-detail-page .product-detail-sizes li,
  .product-detail-page .product-detail-colors li {
    padding: 6px 14px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.85rem;
  }

  .product-detail-page .product-detail-add-to-cart {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;
    padding: 24px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .product-detail-page .product-detail-add-to-cart label {
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .product-detail-page .product-detail-add-to-cart select,
  .product-detail-page .product-detail-add-to-cart input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .product-detail-page .product-detail-add-to-cart input {
    max-width: 120px;
  }

  .product-detail-page .product-detail-add-to-cart select:focus-visible,
  .product-detail-page .product-detail-add-to-cart input:focus-visible {
    outline: 2px solid light-dark(#111111, #f5f5f5);
    outline-offset: 1px;
  }

  .product-detail-page .product-detail-add-to-cart p,
  .product-detail-page .product-detail-add-to-wishlist p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .product-detail-page [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .product-detail-page [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  .product-detail-page .product-detail-add-to-cart a {
    color: inherit;
  }

  .product-detail-page .product-detail-add-to-cart button,
  .product-detail-page .product-detail-add-to-wishlist button {
    width: 100%;
    padding: 14px 24px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  /* Primary: Add to Cart */
  .product-detail-page .product-detail-add-to-cart button {
    margin-top: 4px;
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .product-detail-page .product-detail-add-to-cart button:hover:not(:disabled),
  .product-detail-page .product-detail-add-to-cart button:focus-visible:not(:disabled) {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  /* Secondary: Add to Wishlist */
  .product-detail-page .product-detail-add-to-wishlist {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .product-detail-page .product-detail-add-to-wishlist button {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .product-detail-page .product-detail-add-to-wishlist button:hover:not(:disabled),
  .product-detail-page .product-detail-add-to-wishlist button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .product-detail-page .product-detail-add-to-cart button:disabled,
  .product-detail-page .product-detail-add-to-wishlist button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .product-detail-page {
      padding: 24px 16px 48px;
    }

    .product-detail-page .product-detail-add-to-cart {
      padding: 20px 16px;
    }

    .product-detail-page .product-detail-add-to-cart input {
      max-width: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .product-detail-page .product-detail-back,
    .product-detail-page .product-detail-add-to-cart button,
    .product-detail-page .product-detail-add-to-wishlist button {
      transition: none;
    }
  }
`

function variantLabel(variant) {
  return [variant.size?.size, variant.color?.color_name].filter(Boolean).join(' - ') || `Option ${variant.id}`
}

function ProductDetail() {
  const { id } = useParams()
  // isAuthLoading: AuthContext is still resolving the stored session (see
  // its mount effect) — accessToken can be null here even for an
  // already-logged-in customer until that resolves. /products/:id isn't
  // behind RequireAuth (it's a public route), so unlike Cart.jsx nothing
  // else already guarantees this has settled before this page renders.
  const { accessToken, isLoading: isAuthLoading } = useAuth()

  const [product, setProduct] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')

  const [isWishlisting, setIsWishlisting] = useState(false)
  const [wishlistError, setWishlistError] = useState('')
  const [wishlistSuccess, setWishlistSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setNotFound(false)
    setError('')
    setProduct(null)

    apiGet(ENDPOINTS.productDetail(id))
      .then((data) => {
        if (cancelled) return
        setProduct(data)
        // Default to the first available option, if there is one — the
        // customer can still change it before adding to cart.
        const firstActiveVariant = (data.variants ?? []).find((variant) => variant.is_active)
        setSelectedVariantId(firstActiveVariant ? String(firstActiveVariant.id) : '')
      })
      .catch((err) => {
        if (cancelled) return
        if (err.status === 404) {
          setNotFound(true)
        } else {
          setError(err.message || 'Unable to load this product.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const activeVariants = (product?.variants ?? []).filter((variant) => variant.is_active)

  async function handleAddToCart(event) {
    event.preventDefault()
    setAddError('')
    setAddSuccess('')

    if (activeVariants.length > 0 && !selectedVariantId) {
      setAddError('Please select an option before adding to cart.')
      return
    }

    if (!accessToken) {
      // The button is disabled whenever there's no accessToken, so this
      // is a safety net rather than the primary path — but keep the
      // wording accurate either way: this is a "log in" state, not a
      // transient "still loading" one.
      setAddError('You need to be logged in to add items to your cart.')
      return
    }

    setIsAdding(true)
    try {
      await apiPost(
        ENDPOINTS.cartItems,
        { variant_id: Number(selectedVariantId), quantity },
        { accessToken },
      )
      setAddSuccess('Added to cart.')
    } catch (err) {
      setAddError(err.message || 'Unable to add this item to your cart.')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleAddToWishlist() {
    setWishlistError('')
    setWishlistSuccess('')

    if (!accessToken) {
      setWishlistError('You need to be logged in to use your wishlist.')
      return
    }

    setIsWishlisting(true)
    try {
      await apiPost(ENDPOINTS.wishlist, { product_id: product.id }, { accessToken })
      setWishlistSuccess('Added to wishlist.')
    } catch (err) {
      setWishlistError(err.message || 'Unable to add this product to your wishlist.')
    } finally {
      setIsWishlisting(false)
    }
  }

  return (
    <>
      <Navbar />
      <style href="product-detail-styles" precedence="default">
        {productDetailStyles}
      </style>
      <main className="product-detail-page">
        <Link to="/products" className="product-detail-back">
          ← Back to Products
        </Link>

        {isLoading && <p>Loading product...</p>}

        {!isLoading && notFound && <p role="alert">Product not found.</p>}

        {!isLoading && !notFound && error && <p role="alert">{error}</p>}

        {!isLoading && !notFound && !error && product && (
          <article className="product-detail">
            <h1 className="product-detail-title">{product.name}</h1>

            {product.category && (
              <p className="product-detail-category">{product.category.name}</p>
            )}

            {product.images && product.images.length > 0 && (
              <div className="product-detail-images">
                {product.images.map((image) => (
                  <img key={image.id} src={image.image} alt={image.alt_text || product.name} />
                ))}
              </div>
            )}

            <p className="product-detail-price">₹{product.price}</p>

            {product.description && (
              <p className="product-detail-description">{product.description}</p>
            )}

            {product.sizes && product.sizes.length > 0 && (
              <div className="product-detail-sizes">
                <h2>Sizes</h2>
                <ul>
                  {product.sizes.map((size) => (
                    <li key={size.id}>{size.size}</li>
                  ))}
                </ul>
              </div>
            )}

            {product.colors && product.colors.length > 0 && (
              <div className="product-detail-colors">
                <h2>Colors</h2>
                <ul>
                  {product.colors.map((color) => (
                    <li key={color.id}>{color.color_name}</li>
                  ))}
                </ul>
              </div>
            )}

            <form className="product-detail-add-to-cart" onSubmit={handleAddToCart}>
              <h2>Add to Cart</h2>

              {isAuthLoading && <p>Checking your session...</p>}

              {!isAuthLoading && !accessToken && (
                <p role="alert">
                  You need to be logged in to add items to your cart.{' '}
                  <Link to="/login">Log in</Link>
                </p>
              )}

              {activeVariants.length > 0 ? (
                <>
                  <label htmlFor="variant">Option</label>
                  <select
                    id="variant"
                    name="variant"
                    value={selectedVariantId}
                    onChange={(event) => setSelectedVariantId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select an option
                    </option>
                    {activeVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variantLabel(variant)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p>This product has no purchasable options right now.</p>
              )}

              <label htmlFor="quantity">Quantity</label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                required
              />

              {addError && <p role="alert">{addError}</p>}
              {addSuccess && <p role="status">{addSuccess}</p>}

              <button type="submit" disabled={isAdding || !accessToken || activeVariants.length === 0}>
                {isAdding ? 'Adding...' : 'Add to Cart'}
              </button>
            </form>

            <div className="product-detail-add-to-wishlist">
              {wishlistError && <p role="alert">{wishlistError}</p>}
              {wishlistSuccess && <p role="status">{wishlistSuccess}</p>}

              <button type="button" onClick={handleAddToWishlist} disabled={isWishlisting || !accessToken}>
                {isWishlisting ? 'Adding...' : 'Add to Wishlist'}
              </button>
            </div>
          </article>
        )}
      </main>
    </>
  )
}

export default ProductDetail
