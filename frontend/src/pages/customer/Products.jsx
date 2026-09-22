import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import ProductCard from '../../components/customer/ProductCard'

// Page layout styles, scoped by class name. Rendered through a <style> with
// `href` + `precedence` so React 19 hoists it into the document head once.
// The per-card styles live in ProductCard.jsx.
const productsPageStyles = `
  .products-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 16px 64px;
  }

  .products-page-title {
    margin: 0 0 32px;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .product-list {
    display: grid;
    /* min(100%, 220px) lets a single column shrink below 220px on very
       narrow screens instead of overflowing. */
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: 24px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
`

function Products() {
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setError('')

    apiGet(ENDPOINTS.products)
      .then((data) => {
        if (cancelled) return
        // GET /api/products/ is paginated: {count, next, previous, results}
        setProducts(data?.results ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load products.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Navbar />
      <style href="products-page-styles" precedence="default">
        {productsPageStyles}
      </style>
      <main className="products-page">
        <h1 className="products-page-title">Products</h1>

        {isLoading && <p>Loading products...</p>}

        {!isLoading && error && <p role="alert">{error}</p>}

        {!isLoading && !error && products.length === 0 && <p>No products found.</p>}

        {!isLoading && !error && products.length > 0 && (
          <ul className="product-list">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </main>
    </>
  )
}

export default Products
