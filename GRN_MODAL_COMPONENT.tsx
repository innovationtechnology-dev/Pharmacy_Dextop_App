// GRN Modal Component
// Add this before the closing </div> of the main component in PurchasingPanel.tsx
// After the Payment Modal

{/* GRN Modal */ }
{
    showGRNModal && selectedPurchaseId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Goods Received Note (GRN)</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Purchase Order: PO-{selectedPurchaseId}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setShowGRNModal(false);
                            setGrnItems([]);
                            setReceivedBy('');
                            setGrnNotes('');
                        }}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                    >
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Purchase Info */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-600 dark:text-gray-400">Supplier:</span>
                                <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                                    {purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.supplierName}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-600 dark:text-gray-400">Order Date:</span>
                                <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                                    {new Date(purchaseHistoryList.find(p => p.id === selectedPurchaseId)?.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* GRN Items Table */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Medicine</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Ordered</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Received</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Damaged</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Accepted</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Batch #</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Expiry</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {grnItems.map((item, index) => {
                                        const acceptedQty = item.receivedQuantity - item.damagedQuantity;
                                        return (
                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-3 py-3 text-sm text-gray-900 dark:text-white font-medium">
                                                    {item.medicineName}
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                                                        {item.orderedQuantity}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.receivedQuantity}
                                                        onChange={(e) => updateGRNItem(index, 'receivedQuantity', parseInt(e.target.value) || 0)}
                                                        className="w-20 px-2 py-1 text-center text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={item.receivedQuantity}
                                                        value={item.damagedQuantity}
                                                        onChange={(e) => updateGRNItem(index, 'damagedQuantity', parseInt(e.target.value) || 0)}
                                                        className="w-20 px-2 py-1 text-center text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${acceptedQty === item.orderedQuantity
                                                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                                                            : acceptedQty > 0
                                                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                                                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                                        }`}>
                                                        {acceptedQty}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <input
                                                        type="text"
                                                        value={item.batchNumber}
                                                        onChange={(e) => updateGRNItem(index, 'batchNumber', e.target.value)}
                                                        placeholder="Batch #"
                                                        className="w-28 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <input
                                                        type="date"
                                                        value={item.expiryDate}
                                                        onChange={(e) => updateGRNItem(index, 'expiryDate', e.target.value)}
                                                        className="w-36 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Ordered</div>
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {grnItems.reduce((sum, item) => sum + item.orderedQuantity, 0)}
                            </div>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Received</div>
                            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {grnItems.reduce((sum, item) => sum + item.receivedQuantity, 0)}
                            </div>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Damaged</div>
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                {grnItems.reduce((sum, item) => sum + item.damagedQuantity, 0)}
                            </div>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Accepted</div>
                            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                {grnItems.reduce((sum, item) => sum + (item.receivedQuantity - item.damagedQuantity), 0)}
                            </div>
                        </div>
                    </div>

                    {/* Received By */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Received By *
                        </label>
                        <input
                            type="text"
                            value={receivedBy}
                            onChange={(e) => setReceivedBy(e.target.value)}
                            placeholder="Name of person who received the goods"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    {/* Overall Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Overall Notes (Optional)
                        </label>
                        <textarea
                            value={grnNotes}
                            onChange={(e) => setGrnNotes(e.target.value)}
                            rows={3}
                            placeholder="Any additional notes about the delivery..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                        />
                    </div>
                </div>

                {/* Modal Actions */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl flex gap-3">
                    <button
                        onClick={() => {
                            setShowGRNModal(false);
                            setGrnItems([]);
                            setReceivedBy('');
                            setGrnNotes('');
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateGRN}
                        className="flex-1 px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors font-medium"
                    >
                        Create GRN & Update Inventory
                    </button>
                </div>
            </div>
        </div>
    )
}
