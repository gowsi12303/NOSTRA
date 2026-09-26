import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import ProductCard from '../../components/customer/ProductCard'

// Matches ProductPagination's default page_size (products/pagination.py) —
// made explicit here (rather than relying on the backend's own default) so
// every page request, not just the first, asks for the same page size.
const PAGE_SIZE = 12

function buildProductsQuery(page) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  return `${ENDPOINTS.products}?${params.toString()}`
}

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

  .products-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 40px;
  }

  .products-pagination button {
    padding: 10px 20px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .products-pagination button:hover:not(:disabled),
  .products-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .products-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .products-pagination-info {
    font-size: 0.85rem;
    letter-spacing: 0.05em;
    opacity: 0.75;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .products-pagination button {
      transition: none;
    }
  }
`

function Products() {
  const [products, setProducts] = useState([])
  // next/previous are the raw values GET /api/products/ returns (a full
  // URL or null) — only their truthiness is used, to enable/disable the
  // Previous/Next buttons; count is what total-pages is derived from.
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setError('')

    apiGet(buildProductsQuery(page))
      .then((data) => {
        if (cancelled) return
        // GET /api/products/ is paginated: {count, next, previous, results}
        setProducts(data?.results ?? [])
        setPageInfo({ count: data?.count ?? 0, next: data?.next ?? null, previous: data?.previous ?? null })
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
  }, [page])

  const totalPages = Math.max(1, Math.ceil(pageInfo.count / PAGE_SIZE))

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
          <>
            <ul className="product-list">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ul>

            <div className="products-pagination">
              <button
                type="button"
                onClick={() => setPage((current) => current - 1)}
                disabled={!pageInfo.previous}
              >
                Previous
              </button>
              <span className="products-pagination-info">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={!pageInfo.next}
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </>
  )
}

export default Products
