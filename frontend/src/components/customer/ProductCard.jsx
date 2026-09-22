import { Link } from 'react-router-dom'

// Card styles live here so the component is self-contained wherever it's
// reused. React 19 hoists a <style> that has `href` + `precedence` into the
// document head and renders it once, however many cards are on the page.
// Colors use light-dark() to follow the app's `color-scheme: light dark`.
const productCardStyles = `
  .product-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 24px 20px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
    list-style: none;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .product-card:hover,
  .product-card:focus-within {
    transform: translateY(-4px);
    border-color: light-dark(#111111, #f5f5f5);
    box-shadow: 0 8px 20px light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.6));
  }

  .product-card-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
    line-height: 1.4;
  }

  .product-card-price {
    margin: 0 0 12px;
    font-size: 1rem;
    opacity: 0.75;
  }

  .product-card-link {
    /* margin-top: auto keeps the button on the card's bottom edge even when
       neighbouring cards have names that wrap onto more lines. */
    margin-top: auto;
    padding: 10px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    color: light-dark(#111111, #f5f5f5);
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .product-card-link:hover,
  .product-card-link:focus-visible {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  @media (prefers-reduced-motion: reduce) {
    .product-card,
    .product-card-link {
      transition: none;
    }

    .product-card:hover,
    .product-card:focus-within {
      transform: none;
    }
  }
`

/**
 * Reusable product summary card — used by Products.jsx today, and by any
 * future page that needs the same name/price/"View Product" layout
 * (e.g. search results, category pages, wishlist).
 */
function ProductCard({ product }) {
  return (
    <>
      <style href="product-card-styles" precedence="default">
        {productCardStyles}
      </style>
      <li className="product-card">
        <h2 className="product-card-name">{product.name}</h2>
        <p className="product-card-price">₹{product.price}</p>
        <Link to={`/products/${product.id}`} className="product-card-link">
          View Product
        </Link>
      </li>
    </>
  )
}

export default ProductCard
