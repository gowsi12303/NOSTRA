import { useState } from 'react'

/**
 * Reusable create/edit form for a single address — used by Addresses.jsx
 * for both "add new" (no initialValues) and "edit existing" (initialValues
 * from the address being edited). Only ever submits the editable address
 * fields (full_name, phone, address_line1, address_line2, city, state,
 * postal_code, country, is_default) — never id/created_at/updated_at,
 * even when initialValues is a full address object from the API.
 */
function AddressForm({ initialValues, onSubmit, onCancel, submitLabel = 'Save Address' }) {
  const [formData, setFormData] = useState(() => ({
    full_name: initialValues?.full_name ?? '',
    phone: initialValues?.phone ?? '',
    address_line1: initialValues?.address_line1 ?? '',
    address_line2: initialValues?.address_line2 ?? '',
    city: initialValues?.city ?? '',
    state: initialValues?.state ?? '',
    postal_code: initialValues?.postal_code ?? '',
    country: initialValues?.country ?? 'India',
    is_default: initialValues?.is_default ?? false,
  }))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value, type, checked } = event.target

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await onSubmit(formData)
    } catch (err) {
      setError(err.message || 'Unable to save this address.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="address-form" onSubmit={handleSubmit}>
      <label htmlFor="full_name">Full name</label>
      <input id="full_name" name="full_name" value={formData.full_name} onChange={handleChange} required />

      <label htmlFor="phone">Phone</label>
      <input id="phone" name="phone" value={formData.phone} onChange={handleChange} required />

      <label htmlFor="address_line1">Address line 1</label>
      <input
        id="address_line1"
        name="address_line1"
        value={formData.address_line1}
        onChange={handleChange}
        required
      />

      <label htmlFor="address_line2">Address line 2</label>
      <input id="address_line2" name="address_line2" value={formData.address_line2} onChange={handleChange} />

      <label htmlFor="city">City</label>
      <input id="city" name="city" value={formData.city} onChange={handleChange} required />

      <label htmlFor="state">State</label>
      <input id="state" name="state" value={formData.state} onChange={handleChange} required />

      <label htmlFor="postal_code">Postal code</label>
      <input id="postal_code" name="postal_code" value={formData.postal_code} onChange={handleChange} required />

      <label htmlFor="country">Country</label>
      <input id="country" name="country" value={formData.country} onChange={handleChange} required />

      <label htmlFor="is_default">
        <input
          id="is_default"
          name="is_default"
          type="checkbox"
          checked={formData.is_default}
          onChange={handleChange}
        />
        Set as default address
      </label>

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel}
      </button>

      {onCancel && (
        <button type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
      )}
    </form>
  )
}

export default AddressForm
