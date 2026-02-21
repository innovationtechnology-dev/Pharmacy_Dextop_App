import React from 'react';
import ReactDOM from 'react-dom';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import * as MiscAppFxns from './pages/lib/app/misc.ts';
import { ThemeProvider } from './contexts/ThemeContext';

import Home from './pages/home';
// import SqlDemo from './pages/sqlDemoPage.js';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import ForgotPassword from './components/auth/ForgotPassword';
import Dashboard_Layout from './pages/Dashboard-Layout';
import Dashboard from './pages/dashboard-pages/Dashboard';
import Medicines from './pages/dashboard-pages/Medicines';
import SalesReport from './pages/dashboard-pages/SalesReport';
import SellingPanel from './pages/dashboard-pages/SellingPanel';
import FinancialSummary from './pages/dashboard-pages/FinancialSummary';
import Suppliers from './pages/dashboard-pages/Suppliers';
import Customers from './pages/dashboard-pages/Customers';
import PurchasingPanel from './pages/dashboard-pages/PurchasingPanel';
import PurchaseReport from './pages/dashboard-pages/PurchaseReport';
import Payments from './pages/dashboard-pages/Payments';
import Settings from './pages/dashboard-pages/Settings';
import Alerts from './pages/dashboard-pages/Alerts';
import MainMenu from './pages/dashboard-pages/MainMenu';
import SaleReturn from './pages/dashboard-pages/SaleReturn';
import License from './pages/dashboard-pages/License';
import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard';
import './index.css';
// import OrderDashboard from './pages/dashboard-pages/Order.js'
const updateMainColWidth = MiscAppFxns.updateMainColWidth;

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }
  async componentDidMount() {
    window.addEventListener('resize', updateMainColWidth);
  }
  render() {
    return (
      <ThemeProvider>
        <fieldset id="app">
          <Router>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/Home" element={<Home />} />
              {/* <Route path="/SqlDemo" element={<SqlDemo />} /> */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Navigate to="/login" replace />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
              <Route path="/" element={<Dashboard_Layout />}>
                <Route index element={<Navigate to="/main-menu" />} />
                <Route path="/main-menu" element={<MainMenu />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/medicines" element={<Medicines />} />
                <Route path="/sales" element={<SalesReport />} />
                <Route path="/selling-panel" element={<SellingPanel />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/financial-summary" element={<FinancialSummary />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/purchasing-panel" element={<PurchasingPanel />} />
                <Route path="/purchases" element={<PurchaseReport />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/sale-return" element={<SaleReturn />} />
                <Route path="/license" element={<License />} />
              </Route>
            </Routes>
          </Router>
        </fieldset>
      </ThemeProvider>
    );
  }
}
