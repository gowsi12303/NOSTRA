import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Navbar from '../../components/customer/Navbar'
import ProductCard from '../../components/customer/ProductCard'

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
      <main>
        <h1>Products</h1>

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
