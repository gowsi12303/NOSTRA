import { Link } from 'react-router-dom'

/**
 * Reusable product summary card — used by Products.jsx today, and by any
 * future page that needs the same name/price/"View Product" layout
 * (e.g. search results, category pages, wishlist).
 */
function ProductCard({ product }) {
  return (
    <li className="product-card">
      <h2 className="product-card-name">{product.name}</h2>
      <p className="product-card-price">₹{product.price}</p>
      <Link to={`/products/${product.id}`} className="product-card-link">
        View Product
      </Link>
    </li>
  )
}

export default ProductCard
