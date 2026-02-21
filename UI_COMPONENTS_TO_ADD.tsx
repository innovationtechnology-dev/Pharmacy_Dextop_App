// UI Components to add to PurchasingPanel.tsx

// ==================== 1. STATUS & INVOICE FIELDS ====================
// Add these fields in the supplier information section (around line 1100-1200)
// After the Company field, before the ACTIONS section

{/* STATUS */ }
<div className="flex items-center gap-3">
    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
        Status
    </label>
    <select
        value={purchaseStatus}
        onChange={(e) => setPurchaseStatus(e.target.value as 'ordered' | 'received' | 'completed')}
        className="w-36 h-9 px-3 text-sm font-semibold border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 dark:text-white rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
    >
        <option value="ordered">Ordered</option>
        <option value="received">Received</option>
        <option value="completed">Completed</option>
    </select>
</div>

{/* INVOICE NUMBER */ }
<div className="flex items-center gap-3">
    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
        Invoice #
    </label>
    <input
        type="text"
        value={invoiceNumber}
        onChange={(e) => setInvoiceNumber(e.target.value)}
        placeholder="Supplier invoice"
        className="w-40 h-9 px-3 text-sm font-medium border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
    />
</div>

{/* NOTES */ }
<div className="flex items-center gap-3 flex-1">
    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
        Notes
    </label>
    <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Purchase notes..."
        className="flex-1 h-9 px-3 text-sm font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
    />
</div>

// ==================== 2. ACTION BUTTONS ====================
// Add these buttons in the purchase summary action section (around line 1600)
// After the Reset and New buttons

{/* Add Payment Button - Show only when purchase is selected and has remaining balance */ }
{
    selectedPurchaseId && purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.remainingBalance > 0 && (
        <button
            type="button"
            onClick={() => openPaymentModal(selectedPurchaseId)}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-700 dark:to-blue-600 text-white rounded-lg text-xs font-semibold hover:from-blue-700 hover:to-blue-600 dark:hover:from-blue-800 dark:hover:to-blue-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
        >
            <FiPlus className="w-3.5 h-3.5" />
            <span>Add Payment</span>
        </button>
    )
}

{/* Create GRN Button - Show only when purchase is selected and status is 'ordered' */ }
{
    selectedPurchaseId && purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.status === 'ordered' && (
        <button
            type="button"
            onClick={() => {
                const purchase = purchaseHistoryList.find(p => p.id === selectedPurchaseId);
                if (purchase) openGRNModal(purchase);
            }}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-500 dark:from-purple-700 dark:to-purple-600 text-white rounded-lg text-xs font-semibold hover:from-purple-700 hover:to-purple-600 dark:hover:from-purple-800 dark:hover:to-purple-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
        >
            <FiPackage className="w-3.5 h-3.5" />
            <span>Create GRN</span>
        </button>
    )
}

// ==================== 3. PAYMENT MODAL ====================
// Add this before the closing </div> of the main component (around line 2000)

{/* Payment Modal */ }
{
    showPaymentModal && selectedPurchaseId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Payment</h3>
                    <button
                        onClick={() => {
                            setShowPaymentModal(false);
                            setNewPaymentAmount(0);
                            setPaymentMethod('cash');
                            setPaymentReference('');
                            setPaymentNotes('');
                        }}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                    >
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Purchase Info */}
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Purchase Order:</span>
                            <span className="font-semibold text-gray-900 dark:text-white">PO-{selectedPurchaseId}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Grand Total:</span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                                {formatCurrency(purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.grandTotal || 0)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Already Paid:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.paymentAmount || 0)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                            <span className="text-gray-700 dark:text-gray-300 font-semibold">Remaining Balance:</span>
                            <span className="font-bold text-orange-600 dark:text-orange-400">
                                {formatCurrency(purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.remainingBalance || 0)}
                            </span>
                        </div>
                    </div>

                    {/* Payment Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Payment Amount *
                        </label>
                        <input
                            type="number"
                            min="0"
                            max={purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.remainingBalance || 0}
                            step="0.01"
                            value={newPaymentAmount || ''}
                            onChange={(e) => setNewPaymentAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Payment Method */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Payment Method *
                        </label>
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value as any)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="cash">Cash</option>
                            <option value="cheque">Cheque</option>
                            <option value="bank_deposit">Bank Deposit</option>
                            <option value="card">Card</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    {/* Reference Number */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Reference Number {(paymentMethod === 'cheque' || paymentMethod === 'bank_deposit') && '*'}
                        </label>
                        <input
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder={
                                paymentMethod === 'cheque' ? 'Cheque number' :
                                    paymentMethod === 'bank_deposit' ? 'Transaction ID' :
                                        paymentMethod === 'card' ? 'Last 4 digits' :
                                            'Reference (optional)'
                            }
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                            placeholder="Payment notes..."
                        />
                    </div>

                    {/* Payment History */}
                    {paymentHistory.length > 0 && (
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Payment History</h4>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                {paymentHistory.map((payment: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center text-xs bg-gray-50 dark:bg-gray-700/30 p-2 rounded">
                                        <div>
                                            <span className="font-medium text-gray-900 dark:text-white capitalize">{payment.paymentMethod.replace('_', ' ')}</span>
                                            {payment.reference && <span className="text-gray-500 dark:text-gray-400 ml-2">({payment.reference})</span>}
                                            <div className="text-gray-500 dark:text-gray-400">{new Date(payment.paymentDate).toLocaleDateString()}</div>
                                        </div>
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(payment.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Actions */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl flex gap-3">
                    <button
                        onClick={() => {
                            setShowPaymentModal(false);
                            setNewPaymentAmount(0);
                            setPaymentMethod('cash');
                            setPaymentReference('');
                            setPaymentNotes('');
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAddPayment}
                        className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
                    >
                        Record Payment
                    </button>
                </div>
            </div>
        </div>
    )
}

// Note: The GRN Modal is too large for this file.
// It will be provided in a separate file: GRN_MODAL_COMPONENT.tsx
