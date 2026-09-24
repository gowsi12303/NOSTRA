import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from '../components/admin/AdminLayout'
import AdminCategories from '../pages/admin/Categories'
import AdminCustomers from '../pages/admin/Customers'
import AdminDashboard from '../pages/admin/Dashboard'
import AdminOrders from '../pages/admin/Orders'
import AdminPayments from '../pages/admin/Payments'
import AdminProducts from '../pages/admin/Products'
import AdminVariants from '../pages/admin/Variants'
import Addresses from '../pages/customer/Addresses'
import Cart from '../pages/customer/Cart'
import Checkout from '../pages/customer/Checkout'
import Home from '../pages/customer/Home'
import Login from '../pages/customer/Login'
import OrderConfirmation from '../pages/customer/OrderConfirmation'
import Orders from '../pages/customer/Orders'
import ProductDetail from '../pages/customer/ProductDetail'
import Products from '../pages/customer/Products'
import Register from '../pages/customer/Register'
import Wishlist from '../pages/customer/Wishlist'
import RequireAuth from './RequireAuth'
import RequireStaff from './RequireStaff'

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/addresses" element={<Addresses />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderConfirmation />} />
        </Route>

        <Route element={<RequireStaff />}>
          <Route
            path="/admin"
            element={
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <AdminLayout>
                <AdminCategories />
              </AdminLayout>
            }
          />
          <Route
            path="/admin/products"
            element={
              <AdminLayout>
                <AdminProducts />
              </AdminLayout>
            }
          />
          <Route
            path="/admin/variants"
            element={
              <AdminLayout>
                <AdminVariants />
              </AdminLayout>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <AdminLayout>
                <AdminOrders />
              </AdminLayout>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <AdminLayout>
                <AdminCustomers />
              </AdminLayout>
            }
          />
          <Route
            path="/admin/payments"
            element={
              <AdminLayout>
                <AdminPayments />
              </AdminLayout>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRoutes