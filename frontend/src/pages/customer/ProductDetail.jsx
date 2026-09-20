import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import { useAuth } from '../../hooks/useAuth'

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
      <main>
        <p>
          <Link to="/products">← Back to Products</Link>
        </p>

        {isLoading && <p>Loading product...</p>}

        {!isLoading && notFound && <p role="alert">Product not found.</p>}

        {!isLoading && !notFound && error && <p role="alert">{error}</p>}

        {!isLoading && !notFound && !error && product && (
          <article className="product-detail">
            <h1>{product.name}</h1>

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
