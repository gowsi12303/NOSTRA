import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// Admin-only paths, not yet added to src/api/endpoints.js — this task's
// scope is limited to Categories.jsx only, so they're kept local here (same
// approach as Dashboard.jsx's ADMIN_SUMMARY_ENDPOINTS). Real backend routes:
// see products/urls.py's admin/categories/ (AdminCategoryListCreateView /
// AdminCategoryDetailView), staff/admin only (IsAdminUser).
const ADMIN_CATEGORIES_ENDPOINT = '/api/products/admin/categories/'
const adminCategoryDetailEndpoint = (id) => `/api/products/admin/categories/${id}/`

// Matches ProductPagination's default page_size (12) — explicit here since
// this is the first page number we request, not something the backend
// tells us in advance.
const PAGE_SIZE = 12

// Page styles, scoped under `.admin-categories`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app.
const adminCategoriesStyles = `
  .admin-categories-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-categories [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-categories [role='status'] {
    color: light-dark(#1b6e3c, #6ddc98);
  }

  .admin-categories-empty {
    padding: 32px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    text-align: center;
    opacity: 0.75;
  }

  .admin-categories-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }

  .admin-category-card {
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-category-card.is-inactive {
    opacity: 0.65;
  }

  .admin-category-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .admin-category-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .admin-category-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-category-description {
    margin: 8px 0 0;
    font-size: 0.9rem;
    line-height: 1.5;
    opacity: 0.8;
  }

  .admin-category-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-category-actions button {
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

  .admin-category-actions button:hover:not(:disabled),
  .admin-category-actions button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-category-actions button.is-danger:hover:not(:disabled),
  .admin-category-actions button.is-danger:focus-visible:not(:disabled) {
    border-color: light-dark(#b00020, #ff8a8a);
    background-color: light-dark(#b00020, #ff8a8a);
    color: light-dark(#ffffff, #111111);
  }

  .admin-category-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .admin-categories-pagination {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 0.85rem;
  }

  .admin-categories-pagination button {
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

  .admin-categories-pagination button:hover:not(:disabled),
  .admin-categories-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-categories-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-categories-pagination-count {
    opacity: 0.7;
  }

  .admin-categories h2 {
    margin: 32px 0 12px;
    font-size: 1rem;
  }

  .admin-category-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 480px;
  }

  .admin-category-form label {
    margin-top: 8px;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .admin-category-form input[type='text'],
  .admin-category-form textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
    resize: vertical;
  }

  .admin-category-form-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 0.9rem;
    letter-spacing: normal;
    text-transform: none;
    cursor: pointer;
  }

  .admin-category-form-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .admin-category-form-actions button[type='submit'] {
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

  .admin-category-form-actions button[type='button'] {
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

  .admin-category-form-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

/**
 * Create/edit form for a single category. Used both for "add new" (no
 * initialValues) and "edit existing" (initialValues from the category being
 * edited). Only ever submits name/description (plus is_active, but only
 * when creating — toggling an existing category's active state has its own
 * dedicated action in the list, per the "Toggle active/inactive" requirement,
 * so the edit form itself never re-sends is_active).
 */
function CategoryForm({ initialValues, onSubmit, onCancel, submitLabel }) {
  const [formData, setFormData] = useState(() => ({
    name: initialValues?.name ?? '',
    description: initialValues?.description ?? '',
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
      const payload = initialValues
        ? { name: formData.name, description: formData.description }
        : formData
      await onSubmit(payload)
    } catch (err) {
      setError(err.message || 'Unable to save this category.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="admin-category-form" onSubmit={handleSubmit}>
      <label htmlFor="category-name">Name</label>
      <input
        id="category-name"
        name="name"
        type="text"
        value={formData.name}
        onChange={handleChange}
        required
      />

      <label htmlFor="category-description">Description</label>
      <textarea
        id="category-description"
        name="description"
        value={formData.description}
        onChange={handleChange}
        rows={3}
      />

      {!initialValues && (
        <label htmlFor="category-is-active" className="admin-category-form-checkbox-label">
          <input
            id="category-is-active"
            name="is_active"
            type="checkbox"
            checked={formData.is_active}
            onChange={handleChange}
          />
          Active
        </label>
      )}

      {error && <p role="alert">{error}</p>}

      <div className="admin-category-form-actions">
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
 * Admin category management: list (paginated), create, edit, toggle
 * active/inactive, and delete — backed by the staff-only admin category
 * endpoints (see ADMIN_CATEGORIES_ENDPOINT above).
 */
function Categories() {
  const { accessToken } = useAuth()

  const [categories, setCategories] = useState([])
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Which category is currently mid-edit, or mid toggle/delete, plus
  // feedback for actions that don't already have their own form (the
  // create/edit form shows its own error inline, same as AddressForm).
  const [editingId, setEditingId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  const fetchCategories = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(`${ADMIN_CATEGORIES_ENDPOINT}?page=${page}&page_size=${PAGE_SIZE}`, { accessToken })
        .then((data) => {
          setCategories(data?.results ?? [])
          setPageInfo({ count: data?.count ?? 0, next: data?.next ?? null, previous: data?.previous ?? null })
        })
        .catch((err) => setError(err.message || 'Unable to load categories.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken, page],
  )

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  async function handleCreate(formData) {
    setActionError('')
    setActionSuccess('')
    // Any failure here propagates back to CategoryForm's own try/catch,
    // which shows it inline on the form — nothing to catch here.
    await apiPost(ADMIN_CATEGORIES_ENDPOINT, formData, { accessToken })
    setActionSuccess('Category created.')
    // New categories sort first (admin queryset orders by -created_at) —
    // jump back to page 1 so the admin actually sees it, rather than
    // leaving them on whatever page they were paginated to.
    if (page !== 1) {
      setPage(1)
    } else {
      await fetchCategories({ silent: true })
    }
  }

  async function handleUpdate(id, formData) {
    setActionError('')
    setActionSuccess('')
    await apiPatch(adminCategoryDetailEndpoint(id), formData, { accessToken })
    setActionSuccess('Category updated.')
    setEditingId(null)
    await fetchCategories({ silent: true })
  }

  async function handleToggleActive(category) {
    setActionError('')
    setActionSuccess('')
    setPendingId(category.id)
    const nextActive = !category.is_active
    try {
      await apiPatch(adminCategoryDetailEndpoint(category.id), { is_active: nextActive }, { accessToken })
      setActionSuccess(`Category ${nextActive ? 'activated' : 'deactivated'}.`)
      await fetchCategories({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Unable to update this category.')
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(category) {
    if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) return

    setActionError('')
    setActionSuccess('')
    setPendingId(category.id)
    try {
      await apiDelete(adminCategoryDetailEndpoint(category.id), { accessToken })
      setActionSuccess('Category deleted.')
      // Deleting the last row on a page beyond the first would otherwise
      // leave that page empty — step back a page instead (which triggers
      // its own refetch via the `page` dependency below).
      if (categories.length === 1 && page > 1) {
        setPage((current) => current - 1)
      } else {
        await fetchCategories({ silent: true })
      }
    } catch (err) {
      // A category still referenced by a Product can't be hard-deleted —
      // the backend responds 400 with a {"detail": "..."} message
      // recommending deactivation instead (see AdminCategoryDetailView).
      // client.js's extractErrorMessage already surfaces that `detail`
      // string as-is, so it reaches the admin verbatim, right next to the
      // Deactivate action that resolves it.
      setActionError(err.message || 'Unable to delete this category.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <main className="admin-categories">
      <style href="admin-categories-styles" precedence="default">
        {adminCategoriesStyles}
      </style>

      <h1>Categories</h1>

      {isLoading && <p className="admin-categories-message">Loading categories...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-categories-message">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <>
          {actionError && (
            <p role="alert" className="admin-categories-message">
              {actionError}
            </p>
          )}
          {actionSuccess && (
            <p role="status" className="admin-categories-message">
              {actionSuccess}
            </p>
          )}

          {categories.length === 0 && (
            <p className="admin-categories-message admin-categories-empty">No categories found.</p>
          )}

          {categories.length > 0 && (
            <ul className="admin-categories-list">
              {categories.map((category) => {
                const isPending = pendingId === category.id

                if (editingId === category.id) {
                  return (
                    <li key={category.id} className="admin-category-card">
                      <CategoryForm
                        initialValues={category}
                        submitLabel="Save Changes"
                        onCancel={() => setEditingId(null)}
                        onSubmit={(formData) => handleUpdate(category.id, formData)}
                      />
                    </li>
                  )
                }

                return (
                  <li
                    key={category.id}
                    className={`admin-category-card${category.is_active ? '' : ' is-inactive'}`}
                  >
                    <div className="admin-category-card-header">
                      <p className="admin-category-name">{category.name}</p>
                      <span className="admin-category-status">
                        {category.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {category.description && (
                      <p className="admin-category-description">{category.description}</p>
                    )}

                    <div className="admin-category-actions">
                      <button type="button" onClick={() => setEditingId(category.id)} disabled={isPending}>
                        Edit
                      </button>

                      <button type="button" onClick={() => handleToggleActive(category)} disabled={isPending}>
                        {isPending ? 'Updating...' : category.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => handleDelete(category)}
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

          <div className="admin-categories-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={!pageInfo.previous}
            >
              Previous
            </button>
            <span className="admin-categories-pagination-count">
              Page {page} · {pageInfo.count} {pageInfo.count === 1 ? 'category' : 'categories'}
            </span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pageInfo.next}>
              Next
            </button>
          </div>

          <h2>Add New Category</h2>
          <CategoryForm submitLabel="Add Category" onSubmit={handleCreate} />
        </>
      )}
    </main>
  )
}

export default Categories
