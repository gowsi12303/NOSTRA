import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// Admin-only paths, not yet added to src/api/endpoints.js — this task's
// scope is limited to Variants.jsx only, so they're kept local here (same
// approach as Dashboard.jsx/Categories.jsx/Products.jsx). Real backend
// routes: see products/urls.py's admin/variants/ (AdminProductVariantListView /
// AdminProductVariantDetailView) and admin/products/ (used here only to
// populate the product filter — see the note on productOptions below),
// both staff/admin only (IsAdminUser). There is deliberately no create or
// delete endpoint for variants (see the backend's own module comment above
// AdminProductVariantListView) — this page only lists, filters, and PATCHes
// stock_quantity/is_active.
const ADMIN_VARIANTS_ENDPOINT = '/api/products/admin/variants/'
const adminVariantDetailEndpoint = (id) => `/api/products/admin/variants/${id}/`
const ADMIN_PRODUCTS_ENDPOINT = '/api/products/admin/products/'

// Matches ProductPagination's default page_size (12).
const PAGE_SIZE = 12
// Max page_size the admin endpoints allow. Used for two supplementary,
// unpaginated-in-the-UI snapshots:
//  - the full product list, to populate the "Filter by product" dropdown;
//  - a broad variants snapshot, to derive the "Filter by size"/"Filter by
//    color" dropdown options from whatever sizes/colors actually appear on
//    existing variants (there is no dedicated admin sizes/colors listing
//    endpoint, so this is the only source for those without inventing one).
//    With more than 48 variants store-wide, size/color options beyond that
//    first page won't appear in the dropdowns — a known limitation of
//    reusing this endpoint rather than a dedicated one.
const OPTIONS_PAGE_SIZE = 48

function buildVariantsQuery({ page, search, productFilter, sizeFilter, colorFilter, statusFilter }) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  if (search) params.set('search', search)
  if (productFilter) params.set('product', productFilter)
  if (sizeFilter) params.set('size', sizeFilter)
  if (colorFilter) params.set('color', colorFilter)
  if (statusFilter) params.set('is_active', statusFilter)
  return `${ADMIN_VARIANTS_ENDPOINT}?${params.toString()}`
}

// Page styles, scoped under `.admin-variants`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app.
const adminVariantsStyles = `
  .admin-variants-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-variants [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-variants [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  .admin-variants-empty {
    padding: 32px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    text-align: center;
    opacity: 0.75;
  }

  .admin-variants-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 20px;
    margin-top: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-variants-filter-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .admin-variants-filter-field label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .admin-variants-filter-field input,
  .admin-variants-filter-field select {
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .admin-variants-search-field {
    display: flex;
    gap: 8px;
  }

  .admin-variants-filters button {
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

  .admin-variants-filters button:hover {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-variants-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }

  .admin-variant-card {
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-variant-card.is-inactive {
    opacity: 0.65;
  }

  .admin-variant-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .admin-variant-sku {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .admin-variant-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-variant-status.is-outofstock {
    border-color: light-dark(#b00020, #ff8a8a);
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-variant-details {
    margin: 8px 0 0;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .admin-variant-details strong {
    font-weight: 500;
    opacity: 1;
  }

  .admin-variant-stock-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-variant-stock-row label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .admin-variant-stock-row input[type='number'] {
    width: 90px;
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .admin-variant-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }

  .admin-variant-actions button,
  .admin-variant-stock-row button {
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

  .admin-variant-actions button:hover:not(:disabled),
  .admin-variant-stock-row button:hover:not(:disabled),
  .admin-variant-actions button:focus-visible:not(:disabled),
  .admin-variant-stock-row button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-variant-actions button:disabled,
  .admin-variant-stock-row button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .admin-variants-pagination {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 0.85rem;
  }

  .admin-variants-pagination button {
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

  .admin-variants-pagination button:hover:not(:disabled),
  .admin-variants-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-variants-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-variants-pagination-count {
    opacity: 0.7;
  }
`

/**
 * Admin variant/inventory management: paginated, searchable, filterable
 * list, with stock-quantity editing and active/inactive toggling — backed
 * by the staff-only admin variant endpoints (see ADMIN_VARIANTS_ENDPOINT
 * above). Product/size/color/SKU are read-only here (the backend itself
 * only allows stock_quantity/is_active/sku to be written, and — per this
 * task's scope — this page only edits stock and status, not SKU); creating
 * or deleting variants isn't possible through this API at all (no such
 * endpoint exists — see the backend's own comment on why), so this page
 * never attempts either.
 */
function Variants() {
  const { accessToken } = useAuth()

  const [variants, setVariants] = useState([])
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters. `search`/`productFilter`/`sizeFilter`/`colorFilter`/`statusFilter`
  // are what's actually sent to the API; `searchInput` is the text field's
  // live value, only committed to `search` on submit so every keystroke
  // doesn't fire a request.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [colorFilter, setColorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Filter dropdown options. productOptions comes from the full admin
  // product list; sizeOptions/colorOptions are derived from a broad
  // variants snapshot (see OPTIONS_PAGE_SIZE above for why).
  const [productOptions, setProductOptions] = useState([])
  const [sizeOptions, setSizeOptions] = useState([])
  const [colorOptions, setColorOptions] = useState([])
  const [optionsError, setOptionsError] = useState('')

  // Per-row draft stock-quantity input values, keyed by variant id — lets
  // each row's input be edited independently of the others, and of the
  // variant's last-saved value, until Save is clicked.
  const [stockDrafts, setStockDrafts] = useState({})

  // Which variant is currently mid-save/toggle, plus feedback for those
  // actions (there's no separate form here to show its own inline error,
  // unlike Categories/Products, since editing is inline per row).
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false

    Promise.all([
      apiGet(`${ADMIN_PRODUCTS_ENDPOINT}?page_size=${OPTIONS_PAGE_SIZE}`, { accessToken }),
      apiGet(`${ADMIN_VARIANTS_ENDPOINT}?page_size=${OPTIONS_PAGE_SIZE}`, { accessToken }),
    ])
      .then(([productsData, variantsData]) => {
        if (cancelled) return
        setProductOptions(productsData?.results ?? [])

        const sizesById = new Map()
        const colorsById = new Map()
        for (const variant of variantsData?.results ?? []) {
          if (variant.size) sizesById.set(variant.size.id, variant.size.size)
          if (variant.color) colorsById.set(variant.color.id, variant.color.color_name)
        }
        setSizeOptions(
          [...sizesById.entries()]
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        )
        setColorOptions(
          [...colorsById.entries()]
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        )
      })
      .catch((err) => {
        if (!cancelled) setOptionsError(err.message || 'Unable to load filter options.')
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  const fetchVariants = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(
        buildVariantsQuery({ page, search, productFilter, sizeFilter, colorFilter, statusFilter }),
        { accessToken },
      )
        .then((data) => {
          const results = data?.results ?? []
          setVariants(results)
          setPageInfo({ count: data?.count ?? 0, next: data?.next ?? null, previous: data?.previous ?? null })
          // Reset drafts to the freshly-fetched values, so a row's input
          // reflects the last-saved stock quantity rather than a stale
          // edit from before this refetch.
          setStockDrafts(Object.fromEntries(results.map((v) => [v.id, String(v.stock_quantity)])))
        })
        .catch((err) => setError(err.message || 'Unable to load variants.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken, page, search, productFilter, sizeFilter, colorFilter, statusFilter],
  )

  useEffect(() => {
    fetchVariants()
  }, [fetchVariants])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function handleProductFilterChange(event) {
    setPage(1)
    setProductFilter(event.target.value)
  }

  function handleSizeFilterChange(event) {
    setPage(1)
    setSizeFilter(event.target.value)
  }

  function handleColorFilterChange(event) {
    setPage(1)
    setColorFilter(event.target.value)
  }

  function handleStatusFilterChange(event) {
    setPage(1)
    setStatusFilter(event.target.value)
  }

  async function handleSaveStock(variant) {
    setActionError('')
    setActionSuccess('')

    const draft = stockDrafts[variant.id] ?? ''
    // ProductVariant.stock_quantity is a PositiveIntegerField (the backend
    // itself would reject a negative value with a 400 either way — see
    // AdminProductVariantSerializer's explicit min_value=0), but this
    // check catches it before ever making the request, with a clear
    // message right where the admin is editing.
    if (draft.trim() === '' || !/^\d+$/.test(draft.trim())) {
      setActionError('Stock quantity must be a whole number that is 0 or greater.')
      return
    }
    const nextStock = Number(draft)

    if (nextStock === variant.stock_quantity) {
      setActionSuccess('Stock quantity is already up to date.')
      return
    }

    setPendingId(variant.id)
    try {
      await apiPatch(adminVariantDetailEndpoint(variant.id), { stock_quantity: nextStock }, { accessToken })
      setActionSuccess(`Stock quantity updated to ${nextStock}.`)
      await fetchVariants({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to update stock quantity.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleToggleActive(variant) {
    setActionError('')
    setActionSuccess('')
    setPendingId(variant.id)
    const nextActive = !variant.is_active
    try {
      await apiPatch(adminVariantDetailEndpoint(variant.id), { is_active: nextActive }, { accessToken })
      setActionSuccess(`Variant ${nextActive ? 'activated' : 'deactivated'}.`)
      await fetchVariants({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to update this variant.')
    } finally {
      setPendingId(null)
    }
  }

  const variantLabel = useMemo(
    () => (variant) => [variant.size?.size, variant.color?.color_name].filter(Boolean).join(' / ') || '—',
    [],
  )

  return (
    <main className="admin-variants">
      <style href="admin-variants-styles" precedence="default">
        {adminVariantsStyles}
      </style>

      <h1>Variants</h1>

      {isLoading && <p className="admin-variants-message">Loading variants...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-variants-message">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <>
          {actionError && (
            <p role="alert" className="admin-variants-message">
              {actionError}
            </p>
          )}
          {actionSuccess && (
            <p role="status" className="admin-variants-message">
              {actionSuccess}
            </p>
          )}
          {optionsError && (
            <p role="alert" className="admin-variants-message">
              {optionsError}
            </p>
          )}

          <form className="admin-variants-filters" onSubmit={handleSearchSubmit}>
            <div className="admin-variants-filter-field admin-variants-search-field">
              <label htmlFor="variant-search">Search</label>
              <input
                id="variant-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="SKU or product name"
              />
              <button type="submit">Search</button>
            </div>

            <div className="admin-variants-filter-field">
              <label htmlFor="variant-product-filter">Product</label>
              <select id="variant-product-filter" value={productFilter} onChange={handleProductFilterChange}>
                <option value="">All products</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-variants-filter-field">
              <label htmlFor="variant-size-filter">Size</label>
              <select id="variant-size-filter" value={sizeFilter} onChange={handleSizeFilterChange}>
                <option value="">All sizes</option>
                {sizeOptions.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-variants-filter-field">
              <label htmlFor="variant-color-filter">Color</label>
              <select id="variant-color-filter" value={colorFilter} onChange={handleColorFilterChange}>
                <option value="">All colors</option>
                {colorOptions.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-variants-filter-field">
              <label htmlFor="variant-status-filter">Status</label>
              <select id="variant-status-filter" value={statusFilter} onChange={handleStatusFilterChange}>
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </form>

          {variants.length === 0 && (
            <p className="admin-variants-message admin-variants-empty">No variants found.</p>
          )}

          {variants.length > 0 && (
            <ul className="admin-variants-list">
              {variants.map((variant) => {
                const isPending = pendingId === variant.id
                const isOutOfStock = variant.stock_quantity === 0

                return (
                  <li
                    key={variant.id}
                    className={`admin-variant-card${variant.is_active ? '' : ' is-inactive'}`}
                  >
                    <div className="admin-variant-card-header">
                      <p className="admin-variant-sku">{variant.sku || `Variant #${variant.id}`}</p>
                      <span className="admin-variant-status">
                        {variant.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {isOutOfStock && (
                        <span className="admin-variant-status is-outofstock">Out of Stock</span>
                      )}
                    </div>

                    <p className="admin-variant-details">
                      <strong>{variant.product?.name}</strong> — {variantLabel(variant)}
                    </p>

                    <div className="admin-variant-stock-row">
                      <label htmlFor={`variant-stock-${variant.id}`}>Stock</label>
                      <input
                        id={`variant-stock-${variant.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={stockDrafts[variant.id] ?? String(variant.stock_quantity)}
                        onChange={(event) =>
                          setStockDrafts((current) => ({ ...current, [variant.id]: event.target.value }))
                        }
                        disabled={isPending}
                      />
                      <button type="button" onClick={() => handleSaveStock(variant)} disabled={isPending}>
                        {isPending ? 'Saving...' : 'Save Stock'}
                      </button>

                      <div className="admin-variant-actions">
                        <button type="button" onClick={() => handleToggleActive(variant)} disabled={isPending}>
                          {isPending ? 'Updating...' : variant.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="admin-variants-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={!pageInfo.previous}
            >
              Previous
            </button>
            <span className="admin-variants-pagination-count">
              Page {page} · {pageInfo.count} {pageInfo.count === 1 ? 'variant' : 'variants'}
            </span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pageInfo.next}>
              Next
            </button>
          </div>
        </>
      )}
    </main>
  )
}

export default Variants
