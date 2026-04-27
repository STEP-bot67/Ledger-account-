/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Send, 
  Wallet, 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight, 
  Smartphone,
  Search,
  Settings,
  LogOut,
  Phone,
  LayoutDashboard,
  Lock,
  ChevronLeft,
  Home,
  FileText,
  Shield,
  Edit2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Check,
  Zap,
  Calendar,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Staff, Transaction, AppSettings } from './types';
import { cn, formatCurrency } from './lib/utils';

const DEFAULT_PIN = "0000";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [staff, setStaff] = useState<Staff[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    budgetLimit: 500000,
    currency: 'MWK',
    closedMonths: []
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'staff' | 'tx' | 'report'>('dashboard');

  // Monthly Report state
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [closeMonthCode, setCloseMonthCode] = useState('');
  const [isClosingMonth, setIsClosingMonth] = useState(false);

  // Modals state
  const [showSettings, setShowSettings] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showManageDirectory, setShowManageDirectory] = useState(false);
  const [showFundAccount, setShowFundAccount] = useState(false);
  const [showClearTransactions, setShowClearTransactions] = useState(false);
  const [showTransferTypeSelection, setShowTransferTypeSelection] = useState(false);
  const [activeTransferStaff, setActiveTransferStaff] = useState<Staff | null>(null);
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [activeAdvanceStaff, setActiveAdvanceStaff] = useState<Staff | null>(null);
  const [showBulkAdvance, setShowBulkAdvance] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isAdvanceMode, setIsAdvanceMode] = useState(false);

  // User Manual state
  const [showUserManualModal, setShowUserManualModal] = useState(false);
  const [manualUserInfo, setManualUserInfo] = useState({ name: '', position: '' });

  const generateId = () => {
    return 'id-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5);
  };

  const handleAdvance = (amount: number, staffId: string, suffix: string = '', gateway: string = '', authorizedBy: string = '', authorizerPosition: string = '') => {
    if (isMonthClosed(new Date().toISOString())) {
      alert("This month is currently CLOSED. You cannot perform transactions until it is opened with the required access code.");
      return;
    }
    const staffMember = staff.find(s => s.id === staffId);
    if (!staffMember) return;

    const sequence = transactions.length + 1;
    const refNumber = `ADV-${String(sequence).padStart(5, '0')}${suffix ? '-' + suffix.toUpperCase() : (gateway ? '-' + gateway.toUpperCase() : '')}`;
    
    const newTx: Transaction = {
      id: generateId(),
      reference: refNumber,
      amount,
      type: 'advance',
      staffId,
      timestamp: new Date().toISOString(),
      note: `Salary Advance for ${staffMember.name} (Ref: ${suffix || gateway || 'Auto'}) - Deduction scheduled for month end.`,
      gateway: gateway || 'CASH',
      authorizedBy,
      authorizerPosition
    };

    setTransactions(prev => {
      const updated = [newTx, ...prev];
      return Array.from(new Map(updated.map(tx => [tx.id, tx])).values());
    });

    setActiveAdvanceStaff(null);
  };

  const handleBulkAdvance = (amount: number, suffix: string = '', gateway: string = '', authorizedBy: string = '', authorizerPosition: string = '') => {
    if (isMonthClosed(new Date().toISOString())) {
      alert("This month is currently CLOSED. You cannot perform transactions until it is opened.");
      return;
    }
    const sequence = transactions.length;
    const newTransactions: Transaction[] = [];

    selectedStaffIds.forEach((id, index) => {
      const staffMember = staff.find(s => s.id === id);
      if (!staffMember) return;

      const refNumber = `ADV-${String(sequence + index + 1).padStart(5, '0')}${suffix ? '-' + suffix.toUpperCase() : (gateway ? '-' + gateway.toUpperCase() : '-BULK')}`;
      
      newTransactions.push({
        id: generateId(),
        reference: refNumber,
        amount: amount,
        type: 'advance',
        staffId: id,
        timestamp: new Date().toISOString(),
        note: `Bulk Salary Advance for ${staffMember.name} (Ref: ${suffix || gateway || 'Auto'})`,
        gateway: gateway || 'CASH',
        authorizedBy,
        authorizerPosition
      });
    });

    setTransactions(prev => {
      const updated = [...newTransactions, ...prev];
      return Array.from(new Map(updated.map(tx => [tx.id, tx])).values());
    });
    
    setShowBulkAdvance(false);
    setSelectedStaffIds([]);
    setIsAdvanceMode(false);
    setIsSelectionMode(false);
  };

  const handleBulkTransfer = (amount: number, suffix: string = '', gateway: string = '', authorizedBy: string = '', authorizerPosition: string = '') => {
    if (isMonthClosed(new Date().toISOString())) {
      alert("This month is currently CLOSED. You cannot perform transactions until it is opened.");
      return;
    }
    const totalAmount = amount * selectedStaffIds.length;
    if (reconciledBalance < totalAmount) {
      alert(`Insufficient balance! Total required: ${formatCurrency(totalAmount)}`);
      return;
    }

    const sequence = transactions.length;
    const newTransactions: Transaction[] = [];
    const staffIdsToUpdate = new Set(selectedStaffIds);

    setStaff(prev => {
      const updated = prev.map(s => {
        if (staffIdsToUpdate.has(s.id)) {
          return {
            ...s,
            dataBalance: s.dataBalance + amount,
            totalAllocated: s.totalAllocated + amount
          };
        }
        return s;
      });
      return Array.from(new Map(updated.map(s => [s.id, s])).values());
    });

    selectedStaffIds.forEach((id, index) => {
      const staffMember = staff.find(s => s.id === id);
      if (!staffMember) return;

      const refNumber = `REF-${String(sequence + index + 1).padStart(5, '0')}${suffix ? '-' + suffix.toUpperCase() : (gateway ? '-' + gateway.toUpperCase() : '-BULK')}`;
      
      newTransactions.push({
        id: generateId(),
        reference: refNumber,
        amount: amount,
        type: 'transfer',
        staffId: id,
        timestamp: new Date().toISOString(),
        note: `Bulk allowance for ${staffMember.name} (Ref: ${suffix || gateway || 'Auto'})`,
        gateway: gateway || suffix,
        authorizedBy,
        authorizerPosition
      });
    });

    setTransactions(prev => {
      const updated = [...newTransactions, ...prev];
      return Array.from(new Map(updated.map(tx => [tx.id, tx])).values());
    });
    setShowBulkTransfer(false);
    setSelectedStaffIds([]);
    setIsSelectionMode(false);
  };

  const toggleStaffSelection = (id: string) => {
    setSelectedStaffIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; onSuccess: () => void; title: string }>({
    isOpen: false,
    onSuccess: () => {},
    title: ''
  });

  const AUTHORIZATION_CODES = ['1914', '1918', '1945', '1964', '1967'];

  // Load data from LocalStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000); // Fail-safe to remove loading screen after 2s

    try {
      const savedStaff = localStorage.getItem('staff_data');
      const savedTx = localStorage.getItem('tx_data');
      const savedSettings = localStorage.getItem('app_settings');
      const savedAuth = sessionStorage.getItem('is_authenticated');

      if (savedStaff) {
        const parsed = JSON.parse(savedStaff);
        if (Array.isArray(parsed)) {
          // Deduplicate and ensure valid strings for IDs
          const uniqueStaffMap = new Map();
          parsed.forEach(s => {
            const id = s.id ? String(s.id) : generateId();
            uniqueStaffMap.set(id, { ...s, id });
          });
          setStaff(Array.from(uniqueStaffMap.values()));
        }
      }
      if (savedTx) {
        const parsed = JSON.parse(savedTx);
        if (Array.isArray(parsed)) {
          // Deduplicate and ensure valid strings for IDs
          const uniqueTxMap = new Map();
          parsed.forEach(tx => {
            const id = tx.id ? String(tx.id) : generateId();
            uniqueTxMap.set(id, { ...tx, id });
          });
          setTransactions(Array.from(uniqueTxMap.values()));
        }
      }
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed && typeof parsed === 'object') {
          setSettings(prev => ({ ...prev, ...parsed }));
        }
      }
      if (savedAuth === 'true') setIsAuthenticated(true);
    } catch (err) {
      console.error("Failed to load local storage data:", err);
    } finally {
      setLoading(false);
      clearTimeout(timer);
    }
  }, []);

  // Save data to LocalStorage
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('staff_data', JSON.stringify(staff));
      localStorage.setItem('tx_data', JSON.stringify(transactions));
      localStorage.setItem('app_settings', JSON.stringify(settings));
    }
  }, [staff, transactions, settings, loading]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === DEFAULT_PIN) {
      setIsAuthenticated(true);
      sessionStorage.setItem('is_authenticated', 'true');
    } else {
      alert("Invalid Access Code");
      setPin('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('is_authenticated');
  };

  const handleClearTransactions = (startDate: string, endDate: string, code: string) => {
    if (!AUTHORIZATION_CODES.includes(code)) {
      alert("Invalid Security Code");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const remaining = transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      return txDate < start || txDate > end;
    });

    const deletedCount = transactions.length - remaining.length;
    if (deletedCount === 0) {
      alert("No transactions found in this date range.");
      return;
    }

    setTransactions(remaining);
    setShowClearTransactions(false);
    alert(`Successfully cleared ${deletedCount} transactions.`);
  };

  const handleSettingsUpdate = (budgetLimit: number) => {
    if (budgetLimit > settings.budgetLimit) {
      const diff = budgetLimit - settings.budgetLimit;
      const sequence = transactions.length + 1;
      const refNumber = `REF-${String(sequence).padStart(5, '0')}-BUDGET`;
      
      const newTx: Transaction = {
        id: generateId(),
        reference: refNumber,
        amount: diff,
        type: 'budget_increase',
        timestamp: new Date().toISOString(),
        note: `Budget limit increased from ${formatCurrency(settings.budgetLimit)} to ${formatCurrency(budgetLimit)}`
      };
      setTransactions(prev => {
        const updated = [newTx, ...prev];
        return Array.from(new Map(updated.map(tx => [tx.id, tx])).values());
      });
    }
    
    setSettings(prev => ({ 
      ...prev, 
      budgetLimit
    }));
    setShowSettings(false);
  };

  // Derived stats
  const filteredStaff = useMemo(() => {
    return staff.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.phone.includes(searchQuery)
    );
  }, [staff, searchQuery]);

  const chartData = useMemo(() => {
    if (staff.length === 0) return [];
    return staff.map(s => ({
      name: s.name,
      allocated: s.totalAllocated,
      balance: s.dataBalance
    })).sort((a, b) => b.allocated - a.allocated).slice(0, 5);
  }, [staff]);

  const totalRecharge = useMemo(() => {
    return transactions
      .filter(tx => tx.type === 'fund')
      .reduce((acc, tx) => acc + tx.amount, 0);
  }, [transactions]);

  const totalDistributed = staff.reduce((acc, s) => acc + s.totalAllocated, 0);
  
  const reconciledBalance = useMemo(() => {
    return settings.budgetLimit + totalRecharge - totalDistributed;
  }, [settings.budgetLimit, totalRecharge, totalDistributed]);

  const handleClearMonthData = (month: string) => {
    if (isMonthClosed(month)) {
      alert("Cannot clear a CLOSED month. Please open it first.");
      return;
    }

    const authCode = prompt("SECURITY CLEARANCE REQUIRED\nEnter Authorization Code to clear ALL monthly records:");
    if (!authCode || !AUTHORIZATION_CODES.includes(authCode)) {
      alert("Invalid Security Code. Wipe aborted.");
      return;
    }

    if (!confirm(`Are you absolutely sure you want to PERMANENTLY DELETE all transactions for ${month}? This action will wipe all financial trails for this period.`)) {
      return;
    }

    const txsToClear = transactions.filter(tx => tx.timestamp.startsWith(month));
    
    // Update staff balances by reversing the impact of these transactions
    setStaff(prevStaff => {
      return prevStaff.map(s => {
        let newDataBalance = s.dataBalance;
        let newTotalAllocated = s.totalAllocated;

        txsToClear.forEach(tx => {
          if (tx.staffId === s.id) {
            if (tx.type === 'transfer') {
              newDataBalance -= tx.amount;
              newTotalAllocated -= tx.amount;
            }
            // Add other reversal logic if needed (e.g. for advances if they affected balance)
          }
        });

        return { ...s, dataBalance: Math.max(0, newDataBalance), totalAllocated: Math.max(0, newTotalAllocated) };
      });
    });

    // Remove the transactions
    setTransactions(prev => prev.filter(tx => !tx.timestamp.startsWith(month)));
    alert(`All transactions for ${month} have been cleared. Staff directory remains intact.`);
  };

  const isNearLimit = totalDistributed > (settings.budgetLimit * 0.9);

  const handleTransfer = (amount: number, staffId: string, suffix: string = '', gateway: string = '', authorizedBy: string = '', authorizerPosition: string = '') => {
    if (isMonthClosed(new Date().toISOString())) {
      alert("This month is currently CLOSED. You cannot perform transactions until it is opened.");
      return;
    }
    if (reconciledBalance < amount) {
      alert("Insufficient account balance!");
      return;
    }

    const staffMember = staff.find(s => s.id === staffId);
    if (!staffMember) return;

    const sequence = transactions.length + 1;
    const refNumber = `REF-${String(sequence).padStart(5, '0')}${suffix ? '-' + suffix.toUpperCase() : (gateway ? '-' + gateway.toUpperCase() : '')}`;
    
    const newTx: Transaction = {
      id: generateId(),
      reference: refNumber,
      amount,
      type: 'transfer',
      staffId,
      timestamp: new Date().toISOString(),
      note: `Data allowance for ${staffMember.name} (Ref: ${suffix || gateway || 'Auto'})`,
      gateway: gateway || suffix,
      authorizedBy,
      authorizerPosition
    };

    setStaff(prev => {
      const updated = prev.map(s => s.id === staffId ? {
        ...s,
        dataBalance: s.dataBalance + amount,
        totalAllocated: s.totalAllocated + amount
      } : s);
      return Array.from(new Map(updated.map(s => [s.id, s])).values());
    });

    setTransactions(prev => {
      const updated = [newTx, ...prev];
      return Array.from(new Map(updated.map(tx => [tx.id, tx])).values());
    });

    setActiveTransferStaff(null);
  };

  const monthlyTransactions = useMemo(() => {
    return transactions.filter(tx => tx.timestamp.startsWith(selectedReportMonth));
  }, [transactions, selectedReportMonth]);

  const monthlyStats = useMemo(() => {
    const totalDist = monthlyTransactions
      .filter(tx => tx.type === 'transfer')
      .reduce((acc, tx) => acc + tx.amount, 0);
    
    const totalAdv = monthlyTransactions
      .filter(tx => tx.type === 'advance')
      .reduce((acc, tx) => acc + tx.amount, 0);

    const totalFund = monthlyTransactions
      .filter(tx => tx.type === 'fund')
      .reduce((acc, tx) => acc + tx.amount, 0);

    const staffImpactMap = new Map();
    monthlyTransactions.forEach(tx => {
      if (tx.staffId) {
        const current = staffImpactMap.get(tx.staffId) || { dist: 0, adv: 0 };
        if (tx.type === 'transfer') current.dist += tx.amount;
        if (tx.type === 'advance') current.adv += tx.amount;
        staffImpactMap.set(tx.staffId, current);
      }
    });

    return { totalDist, totalAdv, totalFund, staffImpact: Array.from(staffImpactMap.entries()) };
  }, [monthlyTransactions]);

  const handleFund = (amount: number, suffix: string = '', gateway: string = '', authorizedBy: string = '', authorizerPosition: string = '') => {
    if (isMonthClosed(new Date().toISOString())) {
      alert("This month is currently CLOSED. You cannot perform transactions until it is opened.");
      return;
    }
    const sequence = transactions.length + 1;
    const refNumber = `REF-${String(sequence).padStart(5, '0')}${suffix ? '-' + suffix.toUpperCase() : (gateway ? '-' + gateway.toUpperCase() : '')}`;
    
    const newTx: Transaction = {
      id: generateId(),
      reference: refNumber,
      amount,
      type: 'fund',
      timestamp: new Date().toISOString(),
      note: `Account Funding (Ref: ${suffix || gateway || 'Auto'})`,
      gateway: gateway || 'CASH',
      authorizedBy,
      authorizerPosition
    };

    setTransactions(prev => {
      const updated = [newTx, ...prev];
      return Array.from(new Map(updated.map(tx => [tx.id, tx])).values());
    });

    setShowFundAccount(false);
  };

  const isMonthClosed = (dateStr: string) => {
    const month = dateStr.substring(0, 7);
    return settings.closedMonths.includes(month);
  };

  const handleCloseMonth = (month: string, code: string) => {
    if (code !== '1234567890qwerty') {
      alert("Invalid Access Code for closing/opening month");
      return;
    }

    setSettings(prev => {
      const alreadyClosed = prev.closedMonths.includes(month);
      const newClosedMonths = alreadyClosed 
        ? prev.closedMonths.filter(m => m !== month)
        : [...prev.closedMonths, month];
      
      return {
        ...prev,
        closedMonths: newClosedMonths
      };
    });
    alert(settings.closedMonths.includes(month) ? `Month ${month} has been RE-OPENED.` : `Month ${month} has been CLOSED.`);
    setCloseMonthCode('');
    setIsClosingMonth(false);
  };

  const handleAddStaff = (name: string, phone: string) => {
    const newMember: Staff = {
      id: generateId(),
      name,
      phone,
      dataBalance: 0,
      totalAllocated: 0,
      createdAt: new Date().toISOString()
    };
    
    setStaff(prev => {
      const updated = [newMember, ...prev];
      return Array.from(new Map(updated.map(s => [s.id, s])).values());
    });

    setShowAddStaff(false);
  };

  const handleEditStaff = (id: string, name: string, phone: string) => {
    setStaff(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, name, phone } : s);
      return Array.from(new Map(updated.map(s => [s.id, s])).values());
    });
    setEditingStaff(null);
  };

  const deleteStaffMember = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
    setStaffToDelete(null);
  };

  const requestAuthorization = (title: string, onSuccess: () => void) => {
    setAuthModal({
      isOpen: true,
      onSuccess,
      title
    });
  };

  const exportToPDF = (month?: string) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const timestamp = new Date().toLocaleString();
    const isMonthly = !!month;

    // Title
    doc.setFontSize(isMonthly ? 18 : 22);
    doc.text(isMonthly ? `MONTHLY PERFORMANCE REPORT - ${month}` : "STEP UP DATA ALLOCATION MANAGEMENT REPORT", 14, 20);
    
    const targetTxs = isMonthly 
      ? transactions.filter(tx => tx.timestamp.startsWith(month))
      : transactions.slice(0, 50);

    const tnmAllocated = targetTxs
      .filter(tx => tx.type === 'transfer' && (tx.gateway === 'TNM' || tx.gateway === 'TNM Mpamba'))
      .reduce((acc, tx) => acc + tx.amount, 0);
    
    const airtelAllocated = targetTxs
      .filter(tx => tx.type === 'transfer' && (tx.gateway === 'AIRTEL' || tx.gateway === 'Airtel Money'))
      .reduce((acc, tx) => acc + tx.amount, 0);

    const cashAllocated = targetTxs
      .filter(tx => tx.type === 'transfer' && (tx.gateway === 'CASH' || !tx.gateway))
      .reduce((acc, tx) => acc + tx.amount, 0);

    const totalAdvances = targetTxs
      .filter(tx => tx.type === 'advance')
      .reduce((acc, tx) => acc + tx.amount, 0);

    const totalDist = targetTxs
      .filter(tx => tx.type === 'transfer')
      .reduce((acc, tx) => acc + tx.amount, 0);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${timestamp}`, 14, 28);
    doc.text(isMonthly ? `Period: ${month}` : `Total Budget Limit: K${settings.budgetLimit}`, 14, 34);
    doc.text(isMonthly ? `Period Distribution: K${totalDist}` : `Total Distributed: K${totalDistributed}`, 14, 40);
    doc.text(`Total Salary Advances: K${totalAdvances}`, 14, 46);
    doc.text(`System Balance: K${reconciledBalance}`, 14, 52);
    
    doc.setTextColor(37, 99, 235);
    doc.text(`TNM Allocation: K${tnmAllocated}`, 120, 34);
    doc.text(`Airtel Allocation: K${airtelAllocated}`, 120, 40);
    doc.text(`Cash Allocation: K${cashAllocated}`, 120, 46);

    // Staff Table
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(isMonthly ? "Staff Period Activity Summary" : "Staff Directory Summary", 14, 65);

    const staffData = staff.map(s => {
      const staffTxs = targetTxs.filter(tx => tx.staffId === s.id);
      const dist = staffTxs.filter(tx => tx.type === 'transfer').reduce((acc, tx) => acc + tx.amount, 0);
      const adv = staffTxs.filter(tx => tx.type === 'advance').reduce((acc, tx) => acc + tx.amount, 0);
      
      if (isMonthly) {
        return [s.name, s.phone, `K${dist}`, `K${adv}`];
      }
      return [
        s.name,
        s.phone,
        `K${s.dataBalance}`,
        `K${s.totalAllocated}`,
        `K${adv}`
      ];
    });

    autoTable(doc, {
      startY: 70,
      head: [isMonthly ? ['Staff Name', 'Phone', 'Data Allocated', 'Advance Pay'] : ['Staff Name', 'Phone', 'Data Bal', 'Data Total', 'Adv. Total']],
      body: staffData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    // Transactions Table
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.text(isMonthly ? "Complete Transaction Audit Trail" : "Recent Activity", 14, finalY);

    const txData = targetTxs.map(tx => [
      tx.reference,
      new Date(tx.timestamp).toLocaleString(),
      tx.type.toUpperCase(),
      tx.gateway || 'N/A',
      `${tx.authorizedBy || 'System'} (${tx.authorizerPosition || 'Admin'})`,
      tx.note,
      `${(tx.type === 'transfer' || tx.type === 'advance') ? '-' : '+'}K${tx.amount}`
    ]);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Ref #', 'Timestamp', 'Type', 'Gateway', 'Authorized By', 'Description', 'Amount']],
      body: txData,
      theme: 'grid'
    });

    doc.save(`STEP_UP_REPORT_${isMonthly ? month : 'GENERAL'}.pdf`);
  };

  const handleDownloadUserManual = () => {
    if (!manualUserInfo.name || !manualUserInfo.position) {
      alert("Please enter both Name and Position to generate the manual.");
      return;
    }

    // A3 is 297mm x 420mm (Portrait)
    const doc = new jsPDF('p', 'mm', 'a3');
    const pageWidth = 297;
    const pageHeight = 420;
    const margin = 25;
    const signatureDate = new Date().toLocaleDateString();

    const addHeadedPage = (title: string) => {
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text("STEP UP DATA MANAGEMENT SYSTEM", pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(14);
      doc.text("Official Operator Operational Manual", pageWidth / 2, 30, { align: 'center' });
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(32);
      doc.text(title, margin, 70);
      
      doc.setDrawColor(37, 99, 235); // blue-600
      doc.setLineWidth(1.5);
      doc.line(margin, 75, pageWidth - margin, 75);
    };

    // PAGE 1: Welcome & Overview
    addHeadedPage("System Overview");
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    let y = 90;
    
    doc.text(`Issued to: ${manualUserInfo.name.toUpperCase()}`, margin, y);
    y += 10;
    doc.text(`Designation: ${manualUserInfo.position.toUpperCase()}`, margin, y);
    y += 25;

    const sections = [
      {
        t: "1. Core Purpose",
        c: "The Step Up Data Management System is designed to provide a secure, transparent, and auditable framework for distributing data allowances and managing financial advances for field staff. It ensures that every Kwacha allocated is accounted for through a rigid integrity-check mechanism."
      },
      {
        t: "2. The Dashboard (Financial Nerve Center)",
        c: "The Dashboard provides a real-time snapshot of the system's financial health. \n\u2022 Current Pool: Actual funds available for distribution. \n\u2022 Allocated Funds: Total volume of resources successfully distributed. \n\u2022 Integrity Control: A percentage metric that matches distributions against the master budget budget limit. If this reaches 100%, the system prohibits further transfers to maintain fiscal discipline."
      },
      {
        t: "3. Staff Directory & Data Transfers",
        c: "To send data to a member: \n1. Navigate to the Staff Directory. \n2. Locate the member or use the Search function. \n3. Click 'Send Data'. \n4. Select the gateway (TNM, Airtel, etc.) and enter the authorization code. \n\u2022 Bulk Transfers: You can select multiple staff members and send the same amount to all of them at once to save time."
      }
    ];

    sections.forEach(s => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(s.t, margin, y);
      y += 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      const lines = doc.splitTextToSize(s.c, pageWidth - (margin * 2));
      doc.text(lines, margin, y);
      y += (lines.length * 7) + 15;
    });

    // PAGE 2: Advanced Features
    doc.addPage('a3', 'p');
    addHeadedPage("Operational Protocols");
    y = 90;

    const advancedSections = [
      {
        t: "4. Salary Advances",
        c: "Advances are handled separately from data allocations. They are logged as 'Deductions' and appear in the monthly reports for payroll reconciliation. Advances do not affect the 'Data Balance' of the staff but are tracked in the transaction audit trail."
      },
      {
        t: "5. Monthly Reports & Closing",
        c: "At the end of every operational cycle (typically the last day of the month), the Month Closing protocol MUST be followed: \n1. Go to 'Monthly Report'. \n2. Review the 'Staff Period Activity'. \n3. Verify the Integrity Control Audit. \n4. Use the Master Access Key (REDACTED: XXXXXX) to LOCK the month. \n\u2022 Locked Months: Once locked, no transactions can be added to that period, ensuring data integrity for audits."
      },
      {
        t: "6. Security & Authorization",
        c: "The system is protected by tiered security: \n\u2022 Daily PIN (XXXX): Grants access to the UI. \n\u2022 Authorization Codes (HIDDEN FOR SECURITY): Required for any write operation (Add, Edit, Delete, Transfer). \n\u2022 Master Access Key: Reserved for system-level overrides like opening/closing months. Contact the System Administrator (Albert Chinseu) for secure key retrieval."
      }
    ];

    advancedSections.forEach(s => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(s.t, margin, y);
      y += 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      const lines = doc.splitTextToSize(s.c, pageWidth - (margin * 2));
      doc.text(lines, margin, y);
      y += (lines.length * 7) + 15;
    });

    // PAGE 3: Certificate
    doc.addPage('a3', 'p');
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Border for certificate
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(5);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30);
    doc.setLineWidth(1);
    doc.rect(17, 17, pageWidth - 34, pageHeight - 34);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(40);
    doc.setFont('helvetica', 'bold');
    doc.text("CERTIFICATE OF INDUCTION", pageWidth / 2, 80, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'italic');
    doc.text("This document certifies that", pageWidth / 2, 120, { align: 'center' });
    
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(manualUserInfo.name.toUpperCase(), pageWidth / 2, 145, { align: 'center' });
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'italic');
    doc.text(`holding the position of`, pageWidth / 2, 165, { align: 'center' });
    
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(manualUserInfo.position.toUpperCase(), pageWidth / 2, 180, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    const certText = "has been successfully inducted into the Step Up Data Management System. The individual named above has been trained on operational protocols, security ethics, and fiduciary responsibilities associated with the management of system resources.";
    const certLines = doc.splitTextToSize(certText, pageWidth - 80);
    doc.text(certLines, pageWidth / 2, 210, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`Issued Date: ${signatureDate}`, pageWidth / 2, 280, { align: 'center' });

    // Signature Area
    const signY = 340;
    doc.setDrawColor(15, 23, 42);
    doc.line(pageWidth / 2 - 40, signY, pageWidth / 2 + 40, signY);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("Albert Chinseu", pageWidth / 2, signY + 10, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text("Lead System Developer", pageWidth / 2, signY + 16, { align: 'center' });
    
    // Watermark/Stamp effect
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(2);
    doc.circle(pageWidth / 2, signY - 20, 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("VERIFIED", pageWidth / 2, signY - 19, { align: 'center' });

    doc.save(`USER_MANUAL_${manualUserInfo.name.replace(/\s+/g, '_')}.pdf`);
    setShowUserManualModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600">
        <Smartphone className="animate-bounce w-12 h-12" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-200 p-10 text-center"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-600/20">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Access Secure</h1>
          <p className="text-slate-500 mb-8 font-medium">Enter your 4-digit access code</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="password" 
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 text-center text-4xl tracking-[1em] py-4 rounded-2xl outline-none transition-all font-mono"
            />
            <button 
              type="submit"
              className="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              Verify Identity
            </button>
          </form>
          
          <p className="mt-8 text-xs text-slate-400 font-bold uppercase tracking-[0.3em]">
            STEP UP DATA MANAGEMENT v1.0
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-800 uppercase">Step Up</span>
          </div>
          <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] -mt-4 mb-6">Data Management</p>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto">
          <SidebarItem 
            icon={<LayoutDashboard />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={<Users />} 
            label="Staff Members" 
            active={activeTab === 'staff'} 
            onClick={() => setActiveTab('staff')} 
          />
          <SidebarItem 
            icon={<ArrowUpRight />} 
            label="Transactions" 
            active={activeTab === 'tx'} 
            onClick={() => setActiveTab('tx')} 
          />
          <SidebarItem 
            icon={<Calendar />} 
            label="Monthly Report" 
            active={activeTab === 'report'} 
            onClick={() => setActiveTab('report')} 
          />
          <SidebarItem 
            icon={<Settings />} 
            label="Settings" 
            active={showSettings} 
            onClick={() => setShowSettings(true)} 
          />
        </nav>

        <div className="p-4">
          <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-xl relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-[10px] text-slate-400 mb-1 font-semibold uppercase tracking-wider">Account Balance</p>
              <p className="text-2xl font-bold font-mono tracking-tight">{formatCurrency(reconciledBalance)}</p>
              <button 
                onClick={() => setShowFundAccount(true)}
                className="w-full mt-4 bg-white text-slate-900 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-blue-600 hover:text-white transition-all cursor-pointer transform group-hover:translate-y-[-2px]"
              >
                + Upload Money
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-600/20 rounded-full blur-2xl group-hover:bg-blue-600/40 transition-colors"></div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">Administrator</p>
              <button 
                onClick={handleLogout}
                className="text-[10px] text-slate-500 hover:text-red-600 flex items-center gap-1 font-bold transition-colors uppercase tracking-tight"
              >
                <LogOut className="w-2.5 h-2.5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden pb-20 lg:pb-0">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            {activeTab !== 'dashboard' && (
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-1.5 px-3 py-2 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 transition-all cursor-pointer font-bold text-sm border border-transparent hover:border-slate-200 shadow-sm md:shadow-none"
                title="Return to Dashboard"
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] leading-none mb-1">Step Up Data Management</span>
              <h1 className="text-lg md:text-2xl font-black text-slate-800 tracking-tight leading-none">
                {activeTab === 'dashboard' ? 'Data Reconciliation' : activeTab === 'staff' ? 'Staff Directory' : activeTab === 'tx' ? 'Transaction History' : 'Monthly Performance Report'}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {activeTab === 'tx' && (
              <button 
                onClick={() => setShowClearTransactions(true)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all border border-rose-100 cursor-pointer font-bold text-xs"
              >
                <Trash2 className="w-4 h-4" />
                Clear History
              </button>
            )}
            <div className="hidden md:flex items-center gap-3">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold border shadow-sm",
                isNearLimit 
                  ? "bg-rose-50 text-rose-700 border-rose-100" 
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                <span className={cn("w-2 h-2 rounded-full", isNearLimit ? "bg-rose-500" : "bg-amber-500")}></span>
                {isNearLimit ? "BUDGET ALERT: 90% REACHED" : "RECONCILIATION ACTIVE"}
              </div>
            </div>

            <div className="flex items-center gap-4 text-slate-400">
              <button 
                onClick={() => setActiveTab('report')}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl transition-all border cursor-pointer group",
                  activeTab === 'report' ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-100"
                )}
                title="View Monthly Report"
              >
                <Calendar className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold hidden xl:inline">Monthly Report</span>
              </button>
              <div className="w-px h-6 bg-slate-200"></div>
              <button 
                onClick={exportToPDF}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all border border-slate-200 cursor-pointer group"
                title="Download PDF Report"
              >
                <FileText className="w-4 h-4 group-hover:text-blue-600" />
                <span className="text-xs font-bold hidden xl:inline">Report</span>
              </button>
              <div className="w-px h-6 bg-slate-200"></div>
              <Settings className="w-5 h-5 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => setShowSettings(true)} />
              <div className="w-px h-6 bg-slate-200"></div>
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {activeTab === 'dashboard' && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCard 
                    label="Current Pool" 
                    value={formatCurrency(reconciledBalance)} 
                    icon={<Wallet className="w-5 h-5" />} 
                    color="blue" 
                    subtitle="Funds Ready for Distribution"
                  />
                  
                  <StatCard 
                    label="Allocated Funds" 
                    value={formatCurrency(totalDistributed)} 
                    icon={<Users className="w-5 h-5" />} 
                    color="emerald" 
                    subtitle="Successfully Reconciled"
                  />

                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all cursor-pointer" onClick={() => setShowSettings(true)}>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Budget Control</p>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight">{formatCurrency(settings.budgetLimit)}</h3>
                    </div>
                    <button className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase text-blue-600 tracking-widest group-hover:gap-3 transition-all">
                      Update Limit <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className={cn(
                    "bg-white p-6 rounded-3xl border shadow-sm border-r-8 flex flex-col justify-between",
                    isNearLimit ? "border-rose-500" : "border-blue-500"
                  )}>
                    <div className="flex justify-between items-start">
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Integrity</p>
                      <Shield className={cn("w-4 h-4", isNearLimit ? "text-rose-500" : "text-blue-500")} />
                    </div>
                    
                    <div className="mt-4">
                      <div className="flex justify-between items-end mb-2">
                        <p className="text-2xl font-black font-mono tracking-tight text-slate-900 leading-none">
                          {((totalDistributed / (settings.budgetLimit + totalRecharge)) * 100).toFixed(1)}%
                        </p>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Budget Utilization</span>
                      </div>
                      
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000 ease-out rounded-full",
                            isNearLimit ? "bg-rose-500" : "bg-blue-600"
                          )}
                          style={{ width: `${Math.min(100, (totalDistributed / (settings.budgetLimit + totalRecharge)) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-tight text-right">System Matched Audit</p>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-8">
                  {/* Chart Section */}
                  <div className="col-span-12 lg:col-span-8">
                    <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full">
                      <div className="flex items-center justify-between mb-10">
                        <h3 className="text-lg font-bold text-slate-800">Allocation Distribution</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-black uppercase bg-slate-50 px-2 py-1 rounded">Top 5 Members</span>
                        </div>
                      </div>
                      <div className="flex-1 min-h-[300px]">
                        {chartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fontWeight: 700, fill: '#64748B'}} 
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fill: '#94A3B8'}}
                                tickFormatter={(val) => `K${val/1000}k`}
                              />
                              <Tooltip 
                                cursor={{fill: '#F8FAFC'}}
                                contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '16px'}}
                                formatter={(val: number) => [formatCurrency(val), 'Total Distributed']}
                              />
                              <Bar dataKey="allocated" radius={[8, 8, 0, 0]}>
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={index === 0 ? '#2563EB' : '#94A3B8'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 font-bold italic border-2 border-dashed border-slate-100 rounded-3xl">
                            No allocation data available yet.
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  {/* Transfer Section */}
                  <div className="col-span-12 lg:col-span-4">
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full">
                      <div className="p-6 border-b border-slate-50 flex items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-800">Quick Actions</h3>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setShowTransferTypeSelection(true)}
                            className="text-white bg-slate-900 p-1.5 rounded-lg hover:bg-slate-800 shadow-sm transition-all font-bold group px-3 flex items-center gap-2 cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                            <span className="text-xs">Send Data</span>
                          </button>
                          <button 
                            onClick={() => {
                              setIsAdvanceMode(true);
                              setShowTransferTypeSelection(true);
                            }}
                            className="text-white bg-emerald-600 p-1.5 rounded-lg hover:bg-emerald-700 shadow-sm transition-all font-bold group px-3 flex items-center gap-2 cursor-pointer"
                          >
                            <Wallet className="w-4 h-4" />
                            <span className="text-xs">Advance Pay</span>
                          </button>
                          <button 
                            onClick={() => setShowManageDirectory(true)}
                            className="text-slate-600 bg-slate-100 p-1.5 rounded-lg hover:bg-slate-200 transition-all font-bold group px-3 flex items-center gap-2 cursor-pointer"
                          >
                            <Users className="w-4 h-4" />
                            <span className="text-xs">Manage</span>
                          </button>
                          <button 
                            onClick={() => setShowAddStaff(true)}
                            className="text-white bg-blue-600 p-1.5 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all font-bold group px-3 flex items-center gap-2 cursor-pointer"
                          >
                            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                            <span className="text-xs">Add Staff</span>
                          </button>
                        </div>
                      </div>
                      <div className="p-4 overflow-y-auto space-y-3 max-h-[400px]">
                        {filteredStaff.slice(0, 4).map(s => (
                          <div key={s.id} className={cn(
                            "p-4 rounded-2xl border transition-all group",
                            s.dataBalance < 500 
                              ? "bg-rose-50 border-rose-100" 
                              : "bg-slate-50 border-slate-100 hover:border-blue-100 hover:bg-white hover:shadow-md"
                          )}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold text-slate-700 border border-slate-50 shadow-sm">
                                  {s.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <p className={cn("text-sm font-bold truncate", s.dataBalance < 500 ? "text-rose-900" : "text-slate-800")}>{s.name}</p>
                                  <p className={cn("text-[10px] font-bold mt-0.5", s.dataBalance < 500 ? "text-rose-600 italic" : "text-slate-400")}>
                                    {s.dataBalance < 500 ? "Low Data Balance" : `K${s.dataBalance}`}
                                  </p>
                                </div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setActiveTransferStaff(s); }}
                                className={cn(
                                  "p-2 rounded-lg text-white transition-all shadow-sm active:scale-95 cursor-pointer",
                                  s.dataBalance < 500 ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"
                                )}
                                title="Send Data Budget"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setActiveAdvanceStaff(s); }}
                                className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm active:scale-95 cursor-pointer"
                                title="Salary Advance"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'staff' && (
              <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Staff Members</h3>
                    <p className="text-sm text-slate-400 font-medium">Manage and distribute data to team members</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search team..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all w-64"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        if (isSelectionMode) {
                          if (selectedStaffIds.length > 0) {
                            setShowBulkTransfer(true);
                          } else {
                            alert("Please select at least one staff member.");
                          }
                        } else {
                          setShowTransferTypeSelection(true);
                        }
                      }}
                      className={cn(
                        "px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 cursor-pointer flex items-center gap-2",
                        isSelectionMode ? "bg-amber-600 text-white shadow-amber-600/20" : "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700"
                      )}
                    >
                      <Send className="w-4 h-4" />
                      {isSelectionMode ? "Process Batch" : "Send Data"}
                    </button>
                    {isSelectionMode && (
                      <button 
                        onClick={() => {
                          setIsSelectionMode(false);
                          setSelectedStaffIds([]);
                        }}
                        className="bg-slate-100 text-slate-600 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Exit Bulk
                      </button>
                    )}
                    {!isSelectionMode && (
                      <button 
                        onClick={() => setShowManageDirectory(true)}
                        className="bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Manage List
                      </button>
                    )}
                    <button 
                      onClick={() => setShowAddStaff(true)}
                      className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-slate-900/10 flex items-center gap-2 hover:bg-blue-600 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Member
                    </button>
                  </div>
                </div>
                <div className="relative">
                  {isSelectionMode && (
                    <div className="px-8 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase text-amber-700 tracking-widest">
                          {selectedStaffIds.length} members selected
                        </span>
                        <div className="h-4 w-[1px] bg-amber-200" />
                        <button 
                          onClick={() => {
                            if (selectedStaffIds.length === filteredStaff.length) {
                              setSelectedStaffIds([]);
                            } else {
                              setSelectedStaffIds(filteredStaff.map(s => s.id));
                            }
                          }}
                          className="text-[10px] font-bold text-amber-600 uppercase hover:underline cursor-pointer"
                        >
                          {selectedStaffIds.length === filteredStaff.length ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      <p className="text-[10px] font-bold text-amber-500 italic">Toggle members below to include in batch</p>
                    </div>
                  )}
                  <div className={cn(
                    "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8",
                    isSelectionMode && selectedStaffIds.length > 0 && "pb-32"
                  )}>
                    {filteredStaff.map(s => {
                      const isSelected = selectedStaffIds.includes(s.id);
                      return (
                        <div 
                          key={s.id} 
                          onClick={() => isSelectionMode && toggleStaffSelection(s.id)}
                          className={cn(
                            "bg-slate-50 border rounded-3xl p-6 transition-all group relative cursor-pointer hover:shadow-xl",
                            isSelectionMode && isSelected ? "border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/10" : "border-slate-100",
                            !isSelectionMode && "hover:bg-white"
                          )}
                        >
                          {isSelectionMode && (
                            <div className={cn(
                              "absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                              isSelected ? "bg-blue-600 border-blue-600 shadow-lg shadow-blue-600/20" : "bg-white border-slate-200"
                            )}>
                              {isSelected && <Check className="w-4 h-4 text-white" />}
                            </div>
                          )}
                          <div className="flex items-center gap-4 mb-6">
                            <div className={cn(
                              "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold border transition-colors",
                              isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-300 border-slate-50 shadow-sm group-hover:text-blue-600"
                            )}>
                              {s.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-slate-800 text-lg truncate">{s.name}</p>
                                {!isSelectionMode && (
                                  <div className="flex gap-1 transition-opacity">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); requestAuthorization(`Authorize Edit: ${s.name}`, () => setEditingStaff(s)); }}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); requestAuthorization(`Authorize Delete: ${s.name}`, () => deleteStaffMember(s.id)); }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                              <Smartphone className="w-3 h-3 text-emerald-500" />
                              {s.phone}
                            </p>
                          </div>
                        </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Balance</span>
                          <span className="font-bold text-blue-600 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">{formatCurrency(s.dataBalance)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Issued</span>
                          <span className="font-bold text-slate-900">{formatCurrency(s.totalAllocated)}</span>
                        </div>
                        {!isSelectionMode && (
                          <div className="flex gap-3 mt-6">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveTransferStaff(s); }}
                              className="flex-1 bg-white border-2 border-slate-100 py-3 rounded-2xl text-[10px] font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Send className="w-3 h-3" />
                              Send Data
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveAdvanceStaff(s); }}
                              className="flex-1 bg-white border-2 border-slate-100 py-3 rounded-2xl text-[10px] font-bold text-slate-600 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Wallet className="w-3 h-3" />
                              Sal. Advance
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <AnimatePresence>
                {isSelectionMode && selectedStaffIds.length > 0 && (
                  <motion.div 
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 bg-white p-2 rounded-3xl shadow-2xl border border-slate-100"
                  >
                    <button 
                      onClick={() => {
                        if (isAdvanceMode) {
                          setShowBulkAdvance(true);
                        } else {
                          setShowBulkTransfer(true);
                        }
                      }}
                      className={cn(
                        "text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl transition-all cursor-pointer flex items-center gap-4 hover:scale-105 active:scale-95",
                        isAdvanceMode ? "bg-emerald-600 shadow-emerald-500/40" : "bg-blue-600 shadow-blue-500/40"
                      )}
                    >
                      {isAdvanceMode ? <Wallet className="w-5 h-5 fill-white" /> : <Zap className="w-5 h-5 fill-white" />}
                      Proceed with {selectedStaffIds.length} Staff
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
              </section>
            )}

            {activeTab === 'tx' && (
              <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[600px]">
                <div className="p-8 border-b border-slate-50">
                  <h3 className="text-xl font-bold text-slate-800">Transaction History</h3>
                  <p className="text-sm text-slate-400 font-medium">Verified ledger of all data distributions and funding</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ref ID</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gateway</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsible</th>
                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                        <th className="px-8 py-5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-6 font-mono text-xs text-slate-400 font-bold">{tx.reference}</td>
                          <td className="px-8 py-6 text-sm text-slate-600 font-medium">
                            {new Date(tx.timestamp).toLocaleString()}
                          </td>
                          <td className="px-8 py-6">
                             <div className="flex flex-col">
                               <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight leading-none mb-1">
                                 {tx.authorizedBy || 'System'}
                               </span>
                               <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.1em] leading-none">
                                 {tx.authorizerPosition || 'Admin'}
                               </span>
                             </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className={cn(
                              "px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tight",
                              tx.gateway === 'TNM' ? "bg-emerald-100 text-emerald-700" :
                              tx.gateway === 'AIRTEL' ? "bg-red-100 text-red-700" :
                              "bg-slate-100 text-slate-600"
                            )}>
                              {tx.gateway || 'System'}
                            </span>
                          </td>
                          <td className="px-8 py-6">
                            <span className={cn(
                              "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter",
                              tx.type === 'fund' ? "bg-emerald-50 text-emerald-600" : 
                              tx.type === 'transfer' ? "bg-blue-50 text-blue-600" : 
                              tx.type === 'advance' ? "bg-amber-50 text-amber-600" :
                              "bg-purple-50 text-purple-600"
                            )}>
                              {tx.type === 'fund' ? 'System Fund' : tx.type === 'transfer' ? 'Transfer' : tx.type === 'advance' ? 'Sal. Advance' : 'Budget Add'}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-sm font-bold text-slate-800">{tx.note}</td>
                          <td className={cn(
                            "px-8 py-6 text-right font-bold font-mono tracking-tight",
                            tx.type === 'fund' ? "text-emerald-500" : 
                            (tx.type === 'transfer' || tx.type === 'advance') ? "text-slate-900" : 
                            "text-purple-600"
                          )}>
                            {(tx.type === 'transfer' || tx.type === 'advance') ? '-' : '+'}{formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {transactions.length === 0 && (
                    <div className="p-32 text-center text-slate-400 flex flex-col items-center">
                      <Smartphone className="w-16 h-16 opacity-10 mb-4" />
                      <p className="font-bold italic">No financial activity recorded yet.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'report' && (
              <section className="space-y-8">
                {/* Performance Header */}
                <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-600/20">
                      <Calendar className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-slate-800 tracking-tight">Monthly Performance</h2>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1 italic">Consolidated data & financial integrity audit</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex flex-col px-4 border-r border-slate-200">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Select Period</span>
                      <input 
                        type="month" 
                        value={selectedReportMonth}
                        onChange={(e) => setSelectedReportMonth(e.target.value)}
                        className="bg-transparent font-black text-slate-800 outline-none cursor-pointer"
                      />
                    </div>
                    <div className="px-4 border-r border-slate-200">
                      {isMonthClosed(selectedReportMonth) ? (
                        <div className="flex items-center gap-2 text-rose-600">
                          <Lock className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-widest">Closed</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs font-black uppercase tracking-widest">Active</span>
                          </div>
                          {monthlyTransactions.length > 0 && (
                            <button 
                              onClick={() => handleClearMonthData(selectedReportMonth)}
                              className="text-[9px] font-black text-rose-600 uppercase tracking-widest hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              Reset Records
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Performance Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Monthly Distribution</p>
                     <h3 className="text-3xl font-black text-slate-800 tracking-tight">{formatCurrency(monthlyStats.totalDist)}</h3>
                     <div className="mt-4 flex items-center gap-2 text-blue-600">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Data Allocation</span>
                     </div>
                     <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Zap className="w-16 h-16 text-slate-900" />
                     </div>
                   </div>

                   <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Salary Advances Given</p>
                     <h3 className="text-3xl font-black text-slate-800 tracking-tight">{formatCurrency(monthlyStats.totalAdv)}</h3>
                     <div className="mt-4 flex items-center gap-2 text-rose-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Payable Deductions</span>
                     </div>
                     <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Wallet className="w-16 h-16 text-slate-900" />
                     </div>
                   </div>

                   <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">System Internal Top-ups</p>
                     <h3 className="text-3xl font-black text-slate-800 tracking-tight">{formatCurrency(monthlyStats.totalFund)}</h3>
                     <div className="mt-4 flex items-center gap-2 text-emerald-600">
                        <Zap className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Capital Inflow</span>
                     </div>
                     <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Smartphone className="w-16 h-16 text-slate-900" />
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Staff Performance Table */}
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                    <div className="p-8 border-b border-slate-50">
                      <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Staff Period Activity</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                            <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data Total</th>
                            <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Adv. Pay</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {monthlyStats.staffImpact.map(([sid, impact]) => {
                            const sm = staff.find(s => s.id === sid);
                            return (
                              <tr key={sid} className="hover:bg-slate-50 transition-colors">
                                <td className="px-8 py-4">
                                  <span className="text-sm font-bold text-slate-800">{sm?.name || 'Deleted Staff'}</span>
                                </td>
                                <td className="px-8 py-4">
                                  <span className="text-sm font-bold text-blue-600">{formatCurrency(impact.dist)}</span>
                                </td>
                                <td className="px-8 py-4 text-right">
                                  <span className="text-sm font-bold text-rose-600">{formatCurrency(impact.adv)}</span>
                                </td>
                              </tr>
                            );
                          })}
                          {monthlyStats.staffImpact.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-bold italic">No records for this month</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Close Month Control */}
                  <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden flex flex-col justify-center">
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <Shield className="w-6 h-6 text-blue-400" />
                        <h4 className="text-xl font-black tracking-tight">Integrity Control</h4>
                      </div>
                      
                      {isClosingMonth ? (
                        <div className="space-y-6">
                          <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Verification Code Required</label>
                            <input 
                              type="password"
                              value={closeMonthCode}
                              onChange={(e) => setCloseMonthCode(e.target.value)}
                              placeholder="Access Code..."
                              className="w-full bg-slate-800 border-2 border-slate-700 focus:border-blue-500 p-4 rounded-2xl outline-none transition-all font-mono text-center text-2xl tracking-[0.5em]"
                            />
                          </div>
                          <div className="flex gap-4">
                            <button 
                              onClick={() => setIsClosingMonth(false)}
                              className="flex-1 py-4 bg-slate-800 rounded-2xl font-bold hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleCloseMonth(selectedReportMonth, closeMonthCode)}
                              className="flex-1 py-4 bg-blue-600 rounded-2xl font-bold hover:bg-blue-700 transition-colors shadow-xl shadow-blue-600/20 cursor-pointer"
                            >
                              Confirm {isMonthClosed(selectedReportMonth) ? 'Open' : 'Close'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <p className="text-slate-400 font-bold text-sm leading-relaxed">
                            {isMonthClosed(selectedReportMonth) 
                              ? "This month is currently LOCKED. All transactions are preserved for audit. You need the master key to reopen it."
                              : "Closing the month secures all records from modifications and prepares the system for the next cycle. This action requires authorization."}
                          </p>
                          <button 
                            onClick={() => setIsClosingMonth(true)}
                            className={cn(
                              "w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl active:scale-95 cursor-pointer",
                              isMonthClosed(selectedReportMonth) 
                                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" 
                                : "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                            )}
                          >
                            {isMonthClosed(selectedReportMonth) ? 'Re-open This Month' : 'Finalize & Close Month'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl"></div>
                  </div>
                </div>

                {/* Audit Table */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Full Audit Trail ({selectedReportMonth})</h4>
                    <button onClick={() => exportToPDF(selectedReportMonth)} className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 hover:gap-3 transition-all cursor-pointer">
                      Download Month PDF <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ref</th>
                          <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                          <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Accounted For</th>
                          <th className="px-8 py-5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {monthlyTransactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-4 font-mono text-xs text-slate-400 font-bold">{tx.reference}</td>
                            <td className="px-8 py-4 text-xs font-bold text-slate-600">{new Date(tx.timestamp).toLocaleString()}</td>
                            <td className="px-8 py-4">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                                tx.type === 'transfer' ? "bg-blue-50 text-blue-600" :
                                tx.type === 'advance' ? "bg-rose-50 text-rose-600" :
                                "bg-emerald-50 text-emerald-600"
                              )}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="px-8 py-4">
                              <p className="text-xs font-bold text-slate-800">{tx.note}</p>
                            </td>
                            <td className="px-8 py-4 text-right">
                               <span className={cn(
                                 "text-sm font-mono font-bold",
                                 (tx.type === 'transfer' || tx.type === 'advance') ? "text-slate-900" : "text-emerald-600"
                               )}>
                                 {(tx.type === 'transfer' || tx.type === 'advance') ? '-' : '+'}{formatCurrency(tx.amount)}
                               </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto py-6 px-8 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                STEP UP DATA MANAGEMENT
              </p>
            </div>
            
            <button 
              onClick={() => setShowUserManualModal(true)}
              className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all cursor-pointer shadow-lg shadow-slate-900/10"
            >
              <FileText className="w-3 h-3" />
              User Manual
            </button>

            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em]">
              All rights reserved @2026
            </p>
          </div>
        </footer>
      </main>

      {/* Mobile Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-slate-200 flex items-center justify-around px-2 pb-safe z-40 shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
        <MobileNavItem 
          icon={<Home />} 
          label="Home" 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
        />
        <MobileNavItem 
          icon={<Users />} 
          label="Staff" 
          active={activeTab === 'staff'} 
          onClick={() => setActiveTab('staff')} 
        />
        <MobileNavItem 
          icon={<ArrowUpRight />} 
          label="Vault" 
          active={activeTab === 'tx'} 
          onClick={() => setActiveTab('tx')} 
        />
        <MobileNavItem 
          icon={<FileText />} 
          label="Report" 
          active={activeTab === 'report'} 
          onClick={() => setActiveTab('report')} 
        />
        <MobileNavItem 
          icon={<Settings />} 
          label="Admin" 
          active={showSettings} 
          onClick={() => setShowSettings(true)} 
        />
      </nav>

      {/* Modals */}
      <AnimatePresence>
        {showAddStaff && (
          <Modal key="add-staff-modal" title="Add Team Member" onClose={() => setShowAddStaff(false)}>
            <StaffForm onSubmit={handleAddStaff} onCancel={() => setShowAddStaff(false)} />
          </Modal>
        )}
        {showManageDirectory && (
          <Modal key="manage-directory-modal" title="Manage Staff Directory" onClose={() => setShowManageDirectory(false)}>
            <div className="space-y-6">
              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2">
                {staff.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-md transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold text-slate-300 border border-slate-50">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{s.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{s.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                         onClick={() => requestAuthorization(`Deauthorize ${s.name}`, () => deleteStaffMember(s.id))}
                         className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                {staff.length === 0 && (
                  <div className="py-12 text-center text-slate-400 font-bold italic">
                    Directory is empty
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowManageDirectory(false)}
                className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                Done
              </button>
            </div>
          </Modal>
        )}
        {showFundAccount && (
          <Modal key="fund-account-modal" title="System Top-up" onClose={() => setShowFundAccount(false)}>
            <AmountForm 
              title="Funding Amount (MWK)" 
              buttonText="Confirm Funding" 
              onSubmit={(amount, suffix, gateway, authName, authPos) => requestAuthorization(`Authorize Top-up: ${formatCurrency(amount)}`, () => {
                handleFund(amount, suffix, gateway, authName, authPos);
                setShowFundAccount(false);
              })} 
              onCancel={() => setShowFundAccount(false)} 
            />
          </Modal>
        )}
        {activeTransferStaff && (
          <Modal key="transfer-staff-modal" title={`Transfer to ${activeTransferStaff.name}`} onClose={() => setActiveTransferStaff(null)}>
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between p-5 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
                <div>
                  <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-1">Available Capital</p>
                  <p className="text-2xl font-bold text-blue-700 font-mono tracking-tight">{formatCurrency(reconciledBalance)}</p>
                </div>
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 text-xl font-bold shadow-sm">
                  K
                </div>
              </div>
              <AmountForm 
                title="Enter Amount to Transfer" 
                buttonText="Authorize Transfer" 
                onSubmit={(amount, suffix, gateway, authName, authPos) => requestAuthorization(`Authorize Transfer: ${formatCurrency(amount)}`, () => {
                  handleTransfer(amount, activeTransferStaff.id, suffix, gateway, authName, authPos);
                })}
                onCancel={() => setActiveTransferStaff(null)}
                showMMOption
              />
            </div>
          </Modal>
        )}
        {activeAdvanceStaff && (
          <Modal key="advance-staff-modal" title={`Salary Advance: ${activeAdvanceStaff.name}`} onClose={() => setActiveAdvanceStaff(null)}>
            <div className="mb-6 space-y-4">
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 font-bold uppercase tracking-tight leading-relaxed">
                  Important: This amount will be recorded as a salary advance and must be deducted from the staff member's month-end payroll.
                </p>
              </div>
              <AmountForm 
                title="Enter Advance Amount" 
                buttonText="Authorize Advance" 
                onSubmit={(amount, suffix, gateway, authName, authPos) => requestAuthorization(`Authorize Salary Advance: ${formatCurrency(amount)}`, () => {
                  handleAdvance(amount, activeAdvanceStaff.id, suffix, gateway, authName, authPos);
                })}
                onCancel={() => setActiveAdvanceStaff(null)}
                showMMOption
              />
            </div>
          </Modal>
        )}
        {showBulkAdvance && (
          <Modal key="bulk-advance-modal" title="Bulk Salary Advance" onClose={() => setShowBulkAdvance(false)}>
            <BulkTransferForm 
              staffNames={staff.filter(s => selectedStaffIds.includes(s.id)).map(s => s.name)}
              balance={Infinity} // Advances don't deduct from recon balance
              onConfirm={(amount, suffix, gateway, authName, authPos) => requestAuthorization(`Authorize Bulk Advance: ${formatCurrency(amount * selectedStaffIds.length)}`, () => {
                handleBulkAdvance(amount, suffix, gateway, authName, authPos);
              })}
              onCancel={() => setShowBulkAdvance(false)}
            />
          </Modal>
        )}
        {showSettings && (
          <Modal key="settings-modal" title="Budget Controls" onClose={() => setShowSettings(false)}>
            <div className="space-y-8">
              {/* Top Up Section */}
              <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100/50">
                <label className="block text-[10px] font-black uppercase text-blue-500 tracking-widest mb-4">Quick Top Up Limit</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-blue-300 font-bold text-lg">K</div>
                    <input 
                      type="number" 
                      id="topUpAmountInput"
                      className="w-full pl-10 pr-6 py-4 text-xl font-bold font-mono rounded-2xl border border-blue-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                      placeholder="0.00"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const input = document.getElementById('topUpAmountInput') as HTMLInputElement;
                      const amount = parseFloat(input.value);
                      if (isNaN(amount) || amount <= 0) {
                        alert("Please enter a valid amount");
                        return;
                      }
                      requestAuthorization(`Authorize Top Up: ${formatCurrency(amount)}`, () => {
                        handleSettingsUpdate(settings.budgetLimit + amount);
                        input.value = '';
                      });
                    }}
                    className="px-6 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Top Up
                  </button>
                </div>
                <div className="flex gap-2 mt-4">
                  {[25000, 50000, 100000].map(amt => (
                    <button 
                      key={amt}
                      onClick={() => {
                        const input = document.getElementById('topUpAmountInput') as HTMLInputElement;
                        input.value = amt.toString();
                      }}
                      className="px-3 py-2 bg-white border border-blue-100 text-blue-600 text-[9px] font-black uppercase rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      +{amt/1000}K
                    </button>
                  ))}
                </div>
              </div>

              {/* Modify Section */}
              <div className="px-2">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Set Absolute Monthly Limit</label>
                <div className="relative">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xl">K</div>
                  <input 
                    type="number" 
                    defaultValue={settings.budgetLimit}
                    className="w-full pl-10 pr-6 py-5 text-3xl font-bold font-mono rounded-2xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50"
                    placeholder="0.00"
                    id="budgetLimitInput"
                  />
                </div>
                <p className="text-[9px] text-slate-400 mt-3 leading-relaxed font-bold uppercase tracking-tight">Warning: This sets the direct total budget for the month.</p>
              </div>

              {/* History Dashboard */}
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Limit Top-up History</label>
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {transactions.filter(tx => tx.type === 'budget_increase').length === 0 ? (
                    <div className="py-8 text-center bg-white/50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No history found</p>
                    </div>
                  ) : (
                    transactions
                      .filter(tx => tx.type === 'budget_increase')
                      .map(tx => (
                        <div key={tx.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                          <div>
                            <p className="text-xs font-black text-slate-800">{tx.reference}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                              {new Date(tx.timestamp).toLocaleDateString('en-GB')} at {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-emerald-600">+{formatCurrency(tx.amount)}</p>
                            <p className="text-[8px] font-bold text-slate-300 uppercase mt-0.5 leading-none">Increase Approved</p>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button onClick={() => setShowSettings(false)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer">Close</button>
                <button 
                  onClick={() => {
                    const val = (document.getElementById('budgetLimitInput') as HTMLInputElement).value;
                    const newLimit = parseFloat(val);
                    requestAuthorization(`Authorize Budget Update: ${formatCurrency(newLimit)}`, () => {
                      handleSettingsUpdate(newLimit);
                    });
                  }}
                  className="flex-1 px-4 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-black transition-colors shadow-lg active:scale-95 cursor-pointer"
                >
                  Save New Limit
                </button>
              </div>
            </div>
          </Modal>
        )}
        {showClearTransactions && (
          <Modal key="clear-transactions-modal" title="Clear History" onClose={() => setShowClearTransactions(false)}>
            <ClearTransactionsForm 
              onSubmit={handleClearTransactions}
              onCancel={() => setShowClearTransactions(false)}
            />
          </Modal>
        )}
        {showTransferTypeSelection && (
          <Modal key="transfer-type-modal" title={isAdvanceMode ? "Salary Advance Options" : "Send Data Options"} onClose={() => { setShowTransferTypeSelection(false); setIsAdvanceMode(false); }}>
            <TransferTypeModal 
              onSingle={() => {
                setShowTransferTypeSelection(false);
                setActiveTab('staff');
                setIsSelectionMode(false);
                alert(isAdvanceMode ? "Please select a staff member for Salary Advance." : "Please select a staff member for Data Transfer.");
              }}
              onBulk={() => {
                setShowTransferTypeSelection(false);
                setActiveTab('staff');
                setIsSelectionMode(true);
              }}
              onCancel={() => { setShowTransferTypeSelection(false); setIsAdvanceMode(false); }}
            />
          </Modal>
        )}
        {showBulkTransfer && (
          <Modal key="bulk-transfer-modal" title="Bulk Data Distribution" onClose={() => setShowBulkTransfer(false)}>
            <BulkTransferForm 
              staffNames={staff.filter(s => selectedStaffIds.includes(s.id)).map(s => s.name)}
              balance={reconciledBalance}
              onConfirm={(amount, suffix, gateway, authName, authPos) => requestAuthorization(`Authorize Bulk Transfer: ${formatCurrency(amount * selectedStaffIds.length)}`, () => {
                handleBulkTransfer(amount, suffix, gateway, authName, authPos);
                setShowBulkTransfer(false);
                setIsSelectionMode(false);
                setSelectedStaffIds([]);
              })}
              onCancel={() => setShowBulkTransfer(false)}
            />
          </Modal>
        )}
        {authModal.isOpen && (
          <Modal key="auth-modal" title={authModal.title} onClose={() => setAuthModal({ ...authModal, isOpen: false })}>
            <AuthModal 
              validCodes={AUTHORIZATION_CODES} 
              onSuccess={() => {
                setAuthModal({ ...authModal, isOpen: false });
                authModal.onSuccess();
              }} 
              onCancel={() => setAuthModal({ ...authModal, isOpen: false })} 
            />
          </Modal>
        )}
        {editingStaff && (
          <Modal key="edit-staff-modal" title={`Edit Staff: ${editingStaff.name}`} onClose={() => setEditingStaff(null)}>
            <StaffForm 
              initialData={editingStaff} 
              onSubmit={(name, phone) => handleEditStaff(editingStaff.id, name, phone)} 
              onCancel={() => setEditingStaff(null)} 
            />
          </Modal>
        )}
        {showUserManualModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl p-10 overflow-hidden relative"
            >
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">Generate User Manual</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest italic">A3 Official Induction Format</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Operator Full Name</label>
                    <input 
                      type="text" 
                      value={manualUserInfo.name}
                      onChange={(e) => setManualUserInfo({ ...manualUserInfo, name: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 p-4 rounded-2xl outline-none transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Official Position</label>
                    <input 
                      type="text" 
                      value={manualUserInfo.position}
                      onChange={(e) => setManualUserInfo({ ...manualUserInfo, position: e.target.value })}
                      placeholder="e.g. Finance Officer"
                      className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 p-4 rounded-2xl outline-none transition-all font-bold"
                    />
                  </div>
                  
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-4">
                    <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-700 font-bold leading-relaxed uppercase tracking-tight">
                      This information will be embedded into the User Manual and the Certificate of Induction at the end of the document. Please ensure accuracy.
                    </p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setShowUserManualModal(false)}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleDownloadUserManual}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all cursor-pointer"
                    >
                      Generate PDF [A3]
                    </button>
                  </div>
                </div>
              </div>
              <div className="absolute -right-24 -bottom-24 w-64 h-64 bg-blue-50 rounded-full blur-3xl"></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper Components
function StatCard({ label, value, icon, color, subtitle }: { label: string, value: string, icon: React.ReactNode, color: 'blue' | 'emerald' | 'slate', subtitle?: string }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100'
  };

  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.02 }}
      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center border", colors[color])}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <h3 className="text-2xl font-black text-slate-800 tracking-tight">{value}</h3>
        {subtitle && <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-tighter">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all cursor-pointer text-left",
        active ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {React.cloneElement(icon as React.ReactElement, { className: cn("w-4 h-4", active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-900") })}
      {label}
    </button>
  );
}

function PlatformButton({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 hover:border-blue-200 transition-all cursor-pointer group bg-white"
    >
      <span className="mb-1.5 group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter leading-none group-hover:text-blue-600 transition-colors">{label}</span>
    </button>
  );
}

function MobileNavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 w-16 h-full transition-all relative",
        active ? "text-blue-600" : "text-slate-400"
      )}
    >
      {active && (
        <motion.div 
          layoutId="mobileNavActive"
          className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-full"
        />
      )}
      {React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void, key?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 30 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/50 flex flex-col max-h-[90vh]"
      >
        <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50 shrink-0">
          <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all text-slate-400 hover:rotate-90 cursor-pointer shadow-sm">
            <LayoutDashboard className="w-5 h-5 shadow-sm" />
          </button>
        </div>
        <div className="p-10 overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ClearTransactionsForm({ onSubmit, onCancel }: { onSubmit: (start: string, end: string, code: string) => void, onCancel: () => void }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <p className="text-[10px] text-rose-800 font-bold uppercase tracking-tight leading-relaxed">
          Warning: This action will permanently remove transactions within the specified range. This cannot be undone.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Start Date</label>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">End Date</label>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 text-center">Authorization Code</label>
        <input 
          type="password" 
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={cn(
            "w-full bg-slate-50 border-2 text-center text-4xl tracking-[1em] py-4 rounded-2xl outline-none transition-all font-mono",
            error ? "border-red-500 bg-red-50" : "border-slate-100 focus:border-blue-500"
          )}
          placeholder="••••"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 px-4 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer">Cancel</button>
        <button 
          onClick={() => {
            if (!code) {
              setError(true);
              return;
            }
            onSubmit(startDate, endDate, code);
          }}
          className="flex-1 px-4 py-4 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-95 cursor-pointer"
        >
          Confirm Wipe
        </button>
      </div>
    </div>
  );
}

function TransferTypeModal({ onSingle, onBulk, onCancel }: { onSingle: () => void, onBulk: () => void, onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 font-medium text-center mb-6">Select how you want to distribute data across your team members.</p>
      <button 
        onClick={onSingle}
        className="w-full group p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:bg-white hover:border-blue-200 hover:shadow-xl transition-all cursor-pointer flex items-center gap-6"
      >
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-50 group-hover:bg-blue-600 group-hover:text-white transition-all">
          <Send className="w-8 h-8" />
        </div>
        <div className="text-left">
          <h4 className="font-black text-slate-800 text-lg">Single Transfer</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target a specific staff member</p>
        </div>
      </button>

      <button 
        onClick={onBulk}
        className="w-full group p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:bg-white hover:border-amber-200 hover:shadow-xl transition-all cursor-pointer flex items-center gap-6"
      >
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-slate-50 group-hover:bg-amber-600 group-hover:text-white transition-all">
          <Zap className="w-8 h-8" />
        </div>
        <div className="text-left">
          <h4 className="font-black text-slate-800 text-lg">Bulk Distribution</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select multiple staff for batch send</p>
        </div>
      </button>

      <div className="pt-4">
        <button onClick={onCancel} className="w-full py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer">Close</button>
      </div>
    </div>
  );
}

function BulkTransferForm({ 
  staffNames, 
  onConfirm, 
  onCancel, 
  balance 
}: { 
  staffNames: string[], 
  onConfirm: (amount: number, suffix: string, gateway: string, authName: string, authPos: string) => void, 
  onCancel: () => void,
  balance: number
}) {
  const [amount, setAmount] = useState<string>('');
  const [suffix, setSuffix] = useState('');
  const [gateway, setGateway] = useState<'TNM' | 'AIRTEL' | 'CASH' | null>(null);
  const [authName, setAuthName] = useState('');
  const [authPos, setAuthPos] = useState('');
  const staffCount = staffNames.length;
  
  const total = parseFloat(amount || '0') * staffCount;
  const isOverBalance = total > balance;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl flex items-center gap-4">
        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-50">
          <Zap className="w-6 h-6 fill-blue-600" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest leading-none mb-1">Batch Processing</p>
          <p className="text-sm font-bold text-blue-900">{staffCount} Staff Members Selected</p>
        </div>
      </div>

      <div className="max-h-24 overflow-y-auto px-1 py-2 border border-slate-100 rounded-xl bg-slate-50 shadow-inner">
        <div className="flex flex-wrap gap-2 p-1">
          {staffNames.map((name, i) => (
            <div key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 flex items-center gap-2">
               <div className="w-4 h-4 bg-blue-50 text-blue-600 rounded flex items-center justify-center text-[7px]">{name.charAt(0)}</div>
               {name}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Amount Per Staff (MWK)</label>
        <div className="relative">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xl">K</div>
          <input 
            type="number" 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={cn(
              "w-full pl-10 pr-6 py-5 text-3xl font-bold font-mono rounded-2xl border outline-none transition-all",
              isOverBalance ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-slate-50 border-slate-100 focus:ring-2 focus:ring-blue-500"
            )}
            placeholder="0.00"
          />
        </div>
        <div className="mt-4 flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
           <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total to Deduct</span>
           <span className={cn("text-lg font-black", isOverBalance ? "text-rose-600" : "text-slate-900")}>
             {formatCurrency(total)}
           </span>
        </div>
        {isOverBalance && (
          <p className="text-center text-[10px] font-bold text-rose-600 uppercase mt-3 animate-pulse">Insufficient Recon Balance</p>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 text-center">Select Distribution Gateway</label>
        <div className="grid grid-cols-3 gap-2">
          {['TNM', 'AIRTEL', 'CASH'].map(t => (
            <button 
              key={t}
              onClick={() => setGateway(t as any)}
              className={cn(
                "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                gateway === t ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Responsible Person Name</label>
          <input 
            type="text" 
            value={authName}
            onChange={(e) => setAuthName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
            placeholder="Name"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Position</label>
          <input 
            type="text" 
            value={authPos}
            onChange={(e) => setAuthPos(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
            placeholder="Position"
          />
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 px-4 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer">Cancel</button>
        <button 
          disabled={!amount || isOverBalance || !gateway || !authName || !authPos}
          onClick={() => onConfirm(parseFloat(amount), suffix, gateway || '', authName, authPos)}
          className="flex-1 px-4 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          Confirm Bulk Send
        </button>
      </div>
    </div>
  );
}

function StaffForm({ onSubmit, onCancel, initialData }: { onSubmit: (name: string, phone: string) => void, onCancel: () => void, initialData?: Staff }) {
  const [name, setName] = useState(initialData?.name || '');
  const [phone, setPhone] = useState(initialData?.phone || '');

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Legal Name</label>
        <input 
          type="text" 
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 font-bold"
          placeholder="e.g. Robert TNM"
        />
      </div>
      <div>
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Service ID / Phone</label>
        <input 
          type="tel" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 font-mono"
          placeholder="e.g. 265..."
        />
      </div>
      <div className="flex gap-4 pt-6">
        <button onClick={onCancel} className="flex-1 px-4 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer">Abort</button>
        <button 
          onClick={() => onSubmit(name, phone)}
          disabled={!name || !phone}
          className="flex-1 px-4 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-blue-600 transition-all disabled:opacity-50 shadow-lg cursor-pointer"
        >
          {initialData ? 'Update Record' : 'Add Record'}
        </button>
      </div>
    </div>
  );
}

function AuthModal({ validCodes, onSuccess, onCancel }: { validCodes: string[], onSuccess: () => void, onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validCodes.includes(code)) {
      onSuccess();
    } else {
      setError(true);
      setCode('');
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 font-medium leading-relaxed uppercase tracking-tight">This action requires a high-level authorization code for security audit purposes.</p>
      </div>
      
      <div>
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 text-center">Enter Auth Code</label>
        <input 
          type="password" 
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={cn(
            "w-full bg-slate-50 border-2 text-center text-4xl tracking-[1em] py-4 rounded-2xl outline-none transition-all font-mono",
            error ? "border-red-500 bg-red-50" : "border-slate-100 focus:border-blue-500"
          )}
          placeholder="••••"
          autoFocus
        />
        {error && <p className="text-center text-red-500 text-[10px] font-black uppercase mt-4 animate-shake">Invalid Authorization Code</p>}
      </div>

      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors">Cancel</button>
        <button 
          type="submit"
          className="flex-1 px-4 py-4 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
        >
          Verify & Proceed
        </button>
      </div>
    </form>
  );
}

function AmountForm({ title, buttonText, onSubmit, onCancel, showMMOption = false }: { title: string, buttonText: string, onSubmit: (amount: number, suffix: string, gateway: string, authName: string, authPos: string) => void, onCancel: () => void, showMMOption?: boolean }) {
  const [amount, setAmount] = useState('');
  const [suffix, setSuffix] = useState('');
  const [gateway, setGateway] = useState<'TNM' | 'AIRTEL' | 'CASH' | null>(null);
  const [authName, setAuthName] = useState('');
  const [authPos, setAuthPos] = useState('');

  const handleSubmit = () => {
    const num = parseFloat(amount);
    if (!isNaN(num) && num > 0) {
      if (showMMOption && !gateway) {
        alert("Please select a data gateway");
        return;
      }
      if (!authName || !authPos) {
        alert("Responsible person and position are required");
        return;
      }
      onSubmit(num, suffix, gateway || 'CASH', authName, authPos);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">{title}</label>
          <div className="relative">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-2xl">K</div>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-12 pr-6 py-6 text-4xl font-black font-mono rounded-3xl border border-slate-100 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all bg-slate-50"
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Ref Suffix</label>
          <input 
            type="text" 
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            className="w-full px-6 py-6 text-xl font-bold font-mono rounded-3xl border border-slate-100 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all bg-slate-50 text-slate-600"
            placeholder="XYZ"
            maxLength={10}
          />
          <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Manual Label</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Responsible Person Name</label>
          <input 
            type="text" 
            value={authName}
            onChange={(e) => setAuthName(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl border border-slate-100 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            placeholder="Full Name"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Professional Position</label>
          <input 
            type="text" 
            value={authPos}
            onChange={(e) => setAuthPos(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl border border-slate-100 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            placeholder="Title / Position"
          />
        </div>
      </div>

      <div className="space-y-4">
        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Select Distribution Gateway</label>
        <div className="grid grid-cols-3 gap-4">
          <button 
            onClick={() => setGateway('AIRTEL')}
            className={cn(
              "p-5 rounded-2xl border-2 transition-all text-center group cursor-pointer",
              gateway === 'AIRTEL' ? "border-red-500 bg-red-50" : "border-slate-50 hover:border-red-200 bg-white"
            )}
          >
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-white font-black group-hover:scale-110 transition-transform shadow-xl shadow-red-500/20">
              <Smartphone className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">Airtel</span>
          </button>
          <button 
            onClick={() => setGateway('TNM')}
            className={cn(
              "p-5 rounded-2xl border-2 transition-all text-center group cursor-pointer",
              gateway === 'TNM' ? "border-emerald-500 bg-emerald-50" : "border-slate-50 hover:border-emerald-200 bg-white"
            )}
          >
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3 text-white font-black group-hover:scale-110 transition-transform shadow-xl shadow-emerald-500/20">
              <Smartphone className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">TNM</span>
          </button>
          <button 
            onClick={() => setGateway('CASH')}
            className={cn(
              "p-5 rounded-2xl border-2 transition-all text-center group cursor-pointer",
              gateway === 'CASH' ? "border-slate-900 bg-slate-50" : "border-slate-50 hover:border-slate-300 bg-white"
            )}
          >
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-3 text-white font-black group-hover:scale-110 transition-transform shadow-xl shadow-slate-900/20">
              <Wallet className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">Cash</span>
          </button>
        </div>
      </div>


      <div className="flex gap-4 pt-6">
        <button onClick={onCancel} className="flex-1 px-4 py-5 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-all cursor-pointer">Back</button>
        <button 
          onClick={handleSubmit}
          disabled={!amount}
          className="flex-1 px-4 py-5 bg-slate-900 text-white font-extrabold rounded-2xl hover:bg-blue-600 transition-all disabled:opacity-50 shadow-2xl active:scale-95 cursor-pointer"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
