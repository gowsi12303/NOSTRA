import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// Admin-only paths, not yet added to src/api/endpoints.js — this task's
// scope is limited to Products.jsx only, so they're kept local here (same
// approach as Dashboard.jsx/Categories.jsx). Real backend routes: see
// products/urls.py's admin/products/ (AdminProductListCreateView /
// AdminProductDetailView) and admin/categories/ (used here only to
// populate the category filter/select — see the note on categoryOptions
// below), both staff/admin only (IsAdminUser).
const ADMIN_PRODUCTS_ENDPOINT = '/api/products/admin/products/'
const adminProductDetailEndpoint = (id) => `/api/products/admin/products/${id}/`
const ADMIN_CATEGORIES_ENDPOINT = '/api/products/admin/categories/'

// Matches ProductPagination's default page_size (12).
const PAGE_SIZE = 12
// Max page_size the categories endpoint allows — used to pull every
// category in one request for the filter/select dropdowns (there are only
// ever a handful of categories, so one page is enough; this list isn't
// itself paginated in the UI).
const CATEGORY_OPTIONS_PAGE_SIZE = 48

function buildProductsQuery({ page, search, categoryFilter, statusFilter }) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  if (search) params.set('search', search)
  if (categoryFilter) params.set('category', categoryFilter)
  if (statusFilter) params.set('is_active', statusFilter)
  return `${ADMIN_PRODUCTS_ENDPOINT}?${params.toString()}`
}

// Page styles, scoped under `.admin-products`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app.
const adminProductsStyles = `
  .admin-products-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-products [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-products [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  .admin-products-empty {
    padding: 32px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    text-align: center;
    opacity: 0.75;
  }

  .admin-products-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 20px;
    margin-top: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-products-filter-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .admin-products-filter-field label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .admin-products-filter-field input,
  .admin-products-filter-field select {
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .admin-products-search-field {
    display: flex;
    gap: 8px;
  }

  .admin-products-filters button {
    padding: 8px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-products-filters button:hover {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-products-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }

  .admin-product-card {
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-product-card.is-inactive {
    opacity: 0.65;
  }

  .admin-product-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .admin-product-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .admin-product-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-product-price {
    margin-left: auto;
    font-size: 1.05rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .admin-product-category {
    margin: 6px 0 0;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .admin-product-description {
    margin: 8px 0 0;
    font-size: 0.9rem;
    line-height: 1.5;
    opacity: 0.8;
  }

  .admin-product-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-product-actions button {
    padding: 8px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-product-actions button:hover:not(:disabled),
  .admin-product-actions button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-product-actions button.is-danger:hover:not(:disabled),
  .admin-product-actions button.is-danger:focus-visible:not(:disabled) {
    border-color: light-dark(#b00020, #ff8a8a);
    background-color: light-dark(#b00020, #ff8a8a);
    color: light-dark(#ffffff, #111111);
  }

  .admin-product-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .admin-products-pagination {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 0.85rem;
  }

  .admin-products-pagination button {
    padding: 8px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-products-pagination button:hover:not(:disabled),
  .admin-products-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-products-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-products-pagination-count {
    opacity: 0.7;
  }

  .admin-products h2 {
    margin: 32px 0 12px;
    font-size: 1rem;
  }

  .admin-product-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 480px;
  }

  .admin-product-form label {
    margin-top: 8px;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .admin-product-form input:not([type='checkbox']),
  .admin-product-form textarea,
  .admin-product-form select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
    resize: vertical;
  }

  .admin-product-form-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 0.9rem;
    letter-spacing: normal;
    text-transform: none;
    cursor: pointer;
  }

  .admin-product-form-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .admin-product-form-actions button[type='submit'] {
    padding: 10px 20px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
    font: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-product-form-actions button[type='button'] {
    padding: 10px 20px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-product-form-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

/**
 * Create/edit form for a single product. Used both for "add new" (no
 * initialValues) and "edit existing" (initialValues from the product being
 * edited). Only ever submits name/description/price/category (plus
 * is_active, but only when creating — toggling an existing product's active
 * state has its own dedicated action in the list, per the
 * "Activate/deactivate" requirement, so the edit form itself never re-sends
 * is_active).
 */
function ProductForm({ initialValues, categoryOptions, onSubmit, onCancel, submitLabel }) {
  const [formData, setFormData] = useState(() => ({
    name: initialValues?.name ?? '',
    description: initialValues?.description ?? '',
    price: initialValues?.price ?? '',
    category: initialValues?.category != null ? String(initialValues.category) : '',
    is_active: initialValues?.is_active ?? true,
  }))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setFormData((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const shared = {
        name: formData.name,
        description: formData.description,
        price: formData.price,
        category: Number(formData.category),
      }
      const payload = initialValues ? shared : { ...shared, is_active: formData.is_active }
      await onSubmit(payload)
    } catch (err) {
      setError(err.message || 'Unable to save this product.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="admin-product-form" onSubmit={handleSubmit}>
      <label htmlFor="product-name">Name</label>
      <input
        id="product-name"
        name="name"
        type="text"
        value={formData.name}
        onChange={handleChange}
        required
      />

      <label htmlFor="product-description">Description</label>
      <textarea
        id="product-description"
        name="description"
        value={formData.description}
        onChange={handleChange}
        rows={3}
      />

      <label htmlFor="product-price">Price</label>
      <input
        id="product-price"
        name="price"
        type="number"
        min="0"
        step="0.01"
        value={formData.price}
        onChange={handleChange}
        required
      />

      <label htmlFor="product-category">Category</label>
      <select id="product-category" name="category" value={formData.category} onChange={handleChange} required>
        <option value="" disabled>
          Select a category
        </option>
        {categoryOptions.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
            {category.is_active ? '' : ' (inactive)'}
          </option>
        ))}
      </select>

      {!initialValues && (
        <label htmlFor="product-is-active" className="admin-product-form-checkbox-label">
          <input
            id="product-is-active"
            name="is_active"
            type="checkbox"
            checked={formData.is_active}
            onChange={handleChange}
          />
          Active
        </label>
      )}

      {error && <p role="alert">{error}</p>}

      <div className="admin-product-form-actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Admin product management: paginated/searchable/filterable list, create,
 * edit, toggle active/inactive, and delete — backed by the staff-only admin
 * product endpoints (see ADMIN_PRODUCTS_ENDPOINT above). Images, sizes,
 * colors, and variants are deliberately out of scope here — AdminProductSerializer
 * exposes them read-only for visibility only, and this page just displays
 * name/description/price/category/status.
 */
function Products() {
  const { accessToken } = useAuth()

  const [products, setProducts] = useState([])
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters. `search`/`categoryFilter`/`statusFilter` are what's actually
  // sent to the API; `searchInput` is the text field's live value, only
  // committed to `search` on submit so every keystroke doesn't fire a
  // request.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // category is a plain PK on AdminProductSerializer (not a nested object,
  // unlike the public ProductSerializer — see the comment on
  // AdminProductSerializer in products/serializers.py), so product rows
  // only carry a category id. This list — fetched once, independent of the
  // product list's own pagination/filters — is what turns that id back
  // into a name, and populates the category filter/select dropdowns.
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categoriesError, setCategoriesError] = useState('')

  // Which product is currently mid-edit, or mid toggle/delete, plus
  // feedback for actions that don't already have their own form (the
  // create/edit form shows its own error inline, same as CategoryForm).
  const [editingId, setEditingId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false
    apiGet(`${ADMIN_CATEGORIES_ENDPOINT}?page_size=${CATEGORY_OPTIONS_PAGE_SIZE}`, { accessToken })
      .then((data) => {
        if (!cancelled) setCategoryOptions(data?.results ?? [])
      })
      .catch((err) => {
        if (!cancelled) setCategoriesError(err.message || 'Unable to load categories.')
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  const categoryNameById = new Map(categoryOptions.map((category) => [category.id, category.name]))

  const fetchProducts = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(buildProductsQuery({ page, search, categoryFilter, statusFilter }), { accessToken })
        .then((data) => {
          setProducts(data?.results ?? [])
          setPageInfo({ count: data?.count ?? 0, next: data?.next ?? null, previous: data?.previous ?? null })
        })
        .catch((err) => setError(err.message || 'Unable to load products.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken, page, search, categoryFilter, statusFilter],
  )

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function handleCategoryFilterChange(event) {
    setPage(1)
    setCategoryFilter(event.target.value)
  }

  function handleStatusFilterChange(event) {
    setPage(1)
    setStatusFilter(event.target.value)
  }

  async function handleCreate(formData) {
    setActionError('')
    setActionSuccess('')
    // Any failure here propagates back to ProductForm's own try/catch,
    // which shows it inline on the form — nothing to catch here.
    await apiPost(ADMIN_PRODUCTS_ENDPOINT, formData, { accessToken })
    setActionSuccess('Product created.')
    // New products sort first (admin queryset orders by -created_at) —
    // jump back to page 1 so the admin actually sees it, rather than
    // leaving them on whatever page they were paginated to.
    if (page !== 1) {
      setPage(1)
    } else {
      await fetchProducts({ silent: true })
    }
  }

  async function handleUpdate(id, formData) {
    setActionError('')
    setActionSuccess('')
    await apiPatch(adminProductDetailEndpoint(id), formData, { accessToken })
    setActionSuccess('Product updated.')
    setEditingId(null)
    await fetchProducts({ silent: true })
  }

  async function handleToggleActive(product) {
    setActionError('')
    setActionSuccess('')
    setPendingId(product.id)
    const nextActive = !product.is_active
    try {
      await apiPatch(adminProductDetailEndpoint(product.id), { is_active: nextActive }, { accessToken })
      setActionSuccess(`Product ${nextActive ? 'activated' : 'deactivated'}.`)
      await fetchProducts({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to update this product.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return

    setActionError('')
    setActionSuccess('')
    setPendingId(product.id)
    try {
      await apiDelete(adminProductDetailEndpoint(product.id), { accessToken })
      setActionSuccess('Product deleted.')
      // Deleting the last row on a page beyond the first would otherwise
      // leave that page empty — step back a page instead (which triggers
      // its own refetch via the `page` dependency above).
      if (products.length === 1 && page > 1) {
        setPage((current) => current - 1)
      } else {
        await fetchProducts({ silent: true })
      }
    } catch (err) {
      // A product (or one of its variants) still referenced by protected
      // order/wishlist history can't be hard-deleted — the backend
      // responds 400 with a {"detail": "..."} message recommending
      // deactivation instead (see AdminProductDetailView.perform_destroy).
      // client.js's extractErrorMessage already surfaces that `detail`
      // string as-is, so it reaches the admin verbatim, right next to the
      // Deactivate action that resolves it.
      setActionError(err.message || 'Unable to delete this product.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <main className="admin-products">
      <style href="admin-products-styles" precedence="default">
        {adminProductsStyles}
      </style>

      <h1>Products</h1>

      {isLoading && <p className="admin-products-message">Loading products...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-products-message">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <>
          {actionError && (
            <p role="alert" className="admin-products-message">
              {actionError}
            </p>
          )}
          {actionSuccess && (
            <p role="status" className="admin-products-message">
              {actionSuccess}
            </p>
          )}
          {categoriesError && (
            <p role="alert" className="admin-products-message">
              {categoriesError}
            </p>
          )}

          <form className="admin-products-filters" onSubmit={handleSearchSubmit}>
            <div className="admin-products-filter-field admin-products-search-field">
              <label htmlFor="product-search">Search</label>
              <input
                id="product-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name or description"
              />
              <button type="submit">Search</button>
            </div>

            <div className="admin-products-filter-field">
              <label htmlFor="product-category-filter">Category</label>
              <select id="product-category-filter" value={categoryFilter} onChange={handleCategoryFilterChange}>
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-products-filter-field">
              <label htmlFor="product-status-filter">Status</label>
              <select id="product-status-filter" value={statusFilter} onChange={handleStatusFilterChange}>
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </form>

          {products.length === 0 && (
            <p className="admin-products-message admin-products-empty">No products found.</p>
          )}

          {products.length > 0 && (
            <ul className="admin-products-list">
              {products.map((product) => {
                const isPending = pendingId === product.id

                if (editingId === product.id) {
                  return (
                    <li key={product.id} className="admin-product-card">
                      <ProductForm
                        initialValues={product}
                        categoryOptions={categoryOptions}
                        submitLabel="Save Changes"
                        onCancel={() => setEditingId(null)}
                        onSubmit={(formData) => handleUpdate(product.id, formData)}
                      />
                    </li>
                  )
                }

                return (
                  <li
                    key={product.id}
                    className={`admin-product-card${product.is_active ? '' : ' is-inactive'}`}
                  >
                    <div className="admin-product-card-header">
                      <p className="admin-product-name">{product.name}</p>
                      <span className="admin-product-status">
                        {product.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="admin-product-price">₹{product.price}</span>
                    </div>

                    <p className="admin-product-category">
                      Category: {categoryNameById.get(product.category) ?? `#${product.category}`}
                    </p>

                    {product.description && (
                      <p className="admin-product-description">{product.description}</p>
                    )}

                    <div className="admin-product-actions">
                      <button type="button" onClick={() => setEditingId(product.id)} disabled={isPending}>
                        Edit
                      </button>

                      <button type="button" onClick={() => handleToggleActive(product)} disabled={isPending}>
                        {isPending ? 'Updating...' : product.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => handleDelete(product)}
                        disabled={isPending}
                      >
                        {isPending ? 'Removing...' : 'Delete'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="admin-products-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={!pageInfo.previous}
            >
              Previous
            </button>
            <span className="admin-products-pagination-count">
              Page {page} · {pageInfo.count} {pageInfo.count === 1 ? 'product' : 'products'}
            </span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pageInfo.next}>
              Next
            </button>
          </div>

          <h2>Add New Product</h2>
          <ProductForm submitLabel="Add Product" categoryOptions={categoryOptions} onSubmit={handleCreate} />
        </>
      )}
    </main>
  )
}

export default Products
