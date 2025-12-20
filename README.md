#  AssetVerse Backend

**Backend for Corporate Asset Management System**  

---

## 🚀 Project Overview
This backend powers **AssetVerse**, a B2B HR & Asset Management platform. It handles user authentication, asset CRUD operations, requests, approvals, employee affiliations, package management, Stripe payments, and analytics.  

It communicates with the frontend to provide a secure and scalable API for the system.

---

## 🛠️ Technologies Used
- **Node.js & Express** – Server & API  
- **MongoDB & Mongoose** – Database & ORM  
- **JWT** – Authentication & role-based access  
- **Bcrypt.js** – Password hashing  
- **Stripe** – Payment integration  
- **Cors** – Cross-origin requests handling  
- **dotenv** – Environment variables management  
- **Nodemon** – Development server auto-reload  

---

## 📂 API Endpoints

### Authentication
- `POST /api/auth/firebase-login` – Login user & get JWT token  

### User Management
- `GET /api/users/me` – Get logged-in user profile  
- `PUT /api/users/me` – Update logged-in user profile  
- `POST /api/users/register/hr` – Register HR Manager  
- `POST /api/users/register/employee` – Register Employee  

### Employee & Team
- `GET /api/employees` – Get all employees (HR only)  
- `DELETE /api/employees/:email` – Remove employee from team (HR only)  
- `GET /api/employee/my-team` – Get logged-in employee's team  

### Assets
- `GET /api/assets` – Get all assets  
- `POST /api/assets` – Add new asset (HR only)  
- `PUT /api/assets/:id` – Update asset (HR only)  
- `DELETE /api/assets/:id` – Delete asset (HR only)  
- `GET /api/assets/top-requested` – Get top 5 requested assets (HR only)  

### Requests
- `POST /api/requests` – Employee requests an asset  
- `PUT /api/requests/:id/approve` – HR approves request  
- `PUT /api/requests/:id/reject` – HR rejects request  
- `GET /api/requests` – HR gets all requests  

### Assigned Assets
- `GET /api/assigned/my-assets` – Get employee's assigned assets  
- `PUT /api/assigned/:id/return` – Return an assigned asset  

### Packages & Payments
- `GET /api/packages` – Get available packages  
- `POST /api/packages/upgrade` – Upgrade package via Stripe (HR only)  

---

## 🔑 Environment Variables

Environment variables are required to run the backend and are configured securely in local and production environments.
Sensitive credentials are not included in this repository for security reasons.