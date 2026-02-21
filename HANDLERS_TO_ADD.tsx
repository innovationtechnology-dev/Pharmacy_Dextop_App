// Payment and GRN Handler Functions for PurchasingPanel.tsx
// Add these functions after the clearCart function (around line 523)

// ==================== PAYMENT HANDLERS ====================

const loadPaymentHistory = useCallback(async (purchaseId: number) => {
    try {
        window.electron.ipcRenderer.once('payment-get-by-purchase-reply', (response: any) => {
            if (response.success) {
                setPaymentHistory(response.data || []);
            }
        });
        window.electron.ipcRenderer.sendMessage('payment-get-by-purchase', [purchaseId]);
    } catch (err) {
        console.error('Error loading payment history:', err);
    }
}, []);

const handleAddPayment = useCallback(async () => {
    if (!selectedPurchaseId) {
        alert('Please select a purchase first');
        return;
    }

    if (newPaymentAmount <= 0) {
        alert('Payment amount must be greater than zero');
        return;
    }

    const currentPurchase = purchaseHistoryList.find(p => p.id === selectedPurchaseId);
    if (!currentPurchase) {
        alert('Purchase not found');
        return;
    }

    if (newPaymentAmount > currentPurchase.remainingBalance) {
        alert(`Payment amount cannot exceed remaining balance of ${formatCurrency(currentPurchase.remainingBalance)}`);
        return;
    }

    try {
        window.electron.ipcRenderer.once('payment-add-reply', (response: any) => {
            if (response.success) {
                alert('Payment recorded successfully!');
                setShowPaymentModal(false);
                setNewPaymentAmount(0);
                setPaymentMethod('cash');
                setPaymentReference('');
                setPaymentNotes('');
                loadPastPurchases();
                loadPaymentHistory(selectedPurchaseId);
            } else {
                alert('Error recording payment: ' + (response.error || 'Unknown error'));
            }
        });

        const paymentPayload = {
            purchaseId: selectedPurchaseId,
            amount: newPaymentAmount,
            paymentMethod: paymentMethod,
            reference: paymentReference || undefined,
            notes: paymentNotes || undefined,
            paymentDate: new Date().toISOString(),
        };

        window.electron.ipcRenderer.sendMessage('payment-add', [paymentPayload]);
    } catch (err) {
        alert('Error recording payment. Please try again.');
    }
}, [selectedPurchaseId, newPaymentAmount, paymentMethod, paymentReference, paymentNotes, purchaseHistoryList, loadPastPurchases, loadPaymentHistory]);

const openPaymentModal = useCallback((purchaseId: number) => {
    const purchase = purchaseHistoryList.find(p => p.id === purchaseId);
    if (purchase && purchase.remainingBalance > 0) {
        setNewPaymentAmount(purchase.remainingBalance);
        setShowPaymentModal(true);
        loadPaymentHistory(purchaseId);
    }
}, [purchaseHistoryList, loadPaymentHistory]);

// ==================== GRN HANDLERS ====================

const openGRNModal = useCallback((purchase: any) => {
    if (!purchase || !purchase.items) {
        alert('Invalid purchase data');
        return;
    }

    // Initialize GRN items from purchase items
    const initialGRNItems = purchase.items.map((item: any) => ({
        purchaseItemId: item.id,
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        orderedQuantity: item.packetQuantity,
        receivedQuantity: item.packetQuantity, // Default to ordered quantity
        damagedQuantity: 0,
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate,
        notes: '',
    }));

    setGrnItems(initialGRNItems);
    setReceivedBy('');
    setGrnNotes('');
    setShowGRNModal(true);
}, []);

const updateGRNItem = useCallback((index: number, field: string, value: any) => {
    setGrnItems(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
    });
}, []);

const handleCreateGRN = useCallback(async () => {
    if (!selectedPurchaseId) {
        alert('No purchase selected');
        return;
    }

    if (!receivedBy.trim()) {
        alert('Please enter who received the goods');
        return;
    }

    // Validate all items
    for (const item of grnItems) {
        if (item.receivedQuantity < 0 || item.damagedQuantity < 0) {
            alert(`Invalid quantities for ${item.medicineName}`);
            return;
        }
        if (item.damagedQuantity > item.receivedQuantity) {
            alert(`Damaged quantity cannot exceed received quantity for ${item.medicineName}`);
            return;
        }
        if (!item.batchNumber.trim()) {
            if (!window.confirm(`No batch number for ${item.medicineName}. Continue anyway?`)) {
                return;
            }
        }
    }

    try {
        const currentPurchase = purchaseHistoryList.find(p => p.id === selectedPurchaseId);
        if (!currentPurchase) {
            alert('Purchase not found');
            return;
        }

        window.electron.ipcRenderer.once('grn-create-reply', (response: any) => {
            if (response.success) {
                alert('GRN created successfully! Purchase status updated to "Received".');
                setShowGRNModal(false);
                setGrnItems([]);
                setReceivedBy('');
                setGrnNotes('');
                loadPastPurchases();
            } else {
                alert('Error creating GRN: ' + (response.error || 'Unknown error'));
            }
        });

        const grnPayload = {
            purchaseId: selectedPurchaseId,
            purchaseOrderNumber: `PO-${selectedPurchaseId}`,
            supplierId: currentPurchase.supplierId,
            supplierName: currentPurchase.supplierName,
            items: grnItems,
            receivedBy: receivedBy,
            notes: grnNotes || undefined,
        };

        window.electron.ipcRenderer.sendMessage('grn-create', [grnPayload]);
    } catch (err) {
        console.error('Error creating GRN:', err);
        alert('Error creating GRN. Please try again.');
    }
}, [selectedPurchaseId, receivedBy, grnNotes, grnItems, purchaseHistoryList, loadPastPurchases]);
