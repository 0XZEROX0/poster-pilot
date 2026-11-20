import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './order.css'
import { OrderPage } from './OrderPage'

// The page a customer opens from an order link (order.html#<token>). It is not the app: no sign-in, no app code,
// only the link's items and a short form. See src/data/orderLinks.ts.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OrderPage />
  </StrictMode>,
)
