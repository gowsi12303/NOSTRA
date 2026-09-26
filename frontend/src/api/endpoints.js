// Centralized endpoint URLs for the NOSTRA API. Every URL here matches
// API_DOCUMENTATION.md exactly — only endpoints that currently exist in
// the backend are listed. Add new ones here as they're implemented,
// rather than hardcoding paths in individual api/*.js modules.
//
// Currently covers the public accounts + catalog endpoints, the full
// cart contract, the full wishlist contract, and the full address
// contract:
//   - register / login / token refresh / current user
//   - product list/detail, category list/detail
//   - cart retrieval, add item, update item quantity, remove item
//   - wishlist list, add item, remove item
//   - address list/create, retrieve/update/delete
//   - order list, place order, order detail, order cancellation
//   - payment attempt creation
// The admin endpoints are added in later steps.

export const ENDPOINTS = {
  // Accounts (see accounts/urls.py)
  register: '/api/accounts/register/',
  login: '/api/accounts/login/',
  tokenRefresh: '/api/accounts/token/refresh/',
  currentUser: '/api/accounts/me/',

  // Catalog (public, see products/urls.py)
  products: '/api/products/',
  productDetail: (id) => `/api/products/${id}/`,
  categories: '/api/products/categories/',
  categoryDetail: (id) => `/api/products/categories/${id}/`,

  // Cart (authenticated, see products/urls.py)
  cart: '/api/products/cart/',
  cartItems: '/api/products/cart/items/',
  cartItemDetail: (id) => `/api/products/cart/items/${id}/`,

  // Wishlist (authenticated, see products/urls.py)
  wishlist: '/api/products/wishlist/',
  wishlistItemDetail: (id) => `/api/products/wishlist/${id}/`,

  // Addresses (authenticated, see products/urls.py)
  addresses: '/api/products/addresses/',
  addressDetail: (id) => `/api/products/addresses/${id}/`,

  // Orders (authenticated, see products/urls.py)
  orders: '/api/products/orders/',
  orderPlace: '/api/products/orders/place/',
  orderDetail: (id) => `/api/products/orders/${id}/`,
  orderCancel: (id) => `/api/products/orders/${id}/cancel/`,
  orderPay: (id) => `/api/products/orders/${id}/pay/`,
}
